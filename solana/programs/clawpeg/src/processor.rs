use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    hash::hashv,
    instruction::AccountMeta,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use spl_token_2022::{
    extension::{transfer_hook::TransferHookAccount, BaseStateWithExtensions, StateWithExtensions},
    instruction as token_instruction,
    state::Account,
};
use spl_transfer_hook_interface::{
    get_extra_account_metas_address, get_extra_account_metas_address_and_bump_seed,
    instruction::{ExecuteInstruction, TransferHookInstruction},
};

use crate::{
    error::ClawPegError,
    instruction::{unpack, ClawPegInstruction},
    state::{
        OwnerPeg, PegCollection, PegRecord, OWNER_PEG_SIZE, PEG_COLLECTION_SIZE, STATUS_ACTIVE,
        STATUS_BURNED,
        PEG_RECORD_SIZE,
    },
};

pub struct Processor;

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        match unpack(instruction_data)? {
            ClawPegInstruction::InitializeCollection {
                renderer_hash,
                collection_seed,
                peg_unit,
                max_pegs,
                royalty_bps,
                launch_fee_lamports,
                marketplace_fee_bps,
                flags: _,
                decimals,
            } => Self::initialize_collection(
                program_id,
                accounts,
                renderer_hash,
                collection_seed,
                peg_unit,
                max_pegs,
                royalty_bps,
                launch_fee_lamports,
                marketplace_fee_bps,
                decimals,
            ),
            ClawPegInstruction::InitializeOwnerPeg => {
                Self::initialize_owner_peg(program_id, accounts)
            }
            ClawPegInstruction::SyncPeg => Self::sync_peg(accounts),
            ClawPegInstruction::TransferPeg { peg_id } => Self::transfer_peg(program_id, accounts, peg_id),
            ClawPegInstruction::BurnPeg { peg_id } => Self::burn_peg(accounts, peg_id),
            ClawPegInstruction::MintPeg { peg_id } => Self::mint_peg(program_id, accounts, peg_id),
            ClawPegInstruction::InitializeTransferHookAccounts { interface_order } => {
                Self::initialize_transfer_hook_accounts(program_id, accounts, interface_order)
            }
            ClawPegInstruction::ExecuteTransferHook { amount } => {
                Self::execute_transfer_hook(program_id, accounts, amount)
            }
        }
    }

    fn initialize_collection(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        renderer_hash: [u8; 32],
        collection_seed: [u8; 32],
        peg_unit: u64,
        max_pegs: u32,
        royalty_bps: u16,
        launch_fee_lamports: u64,
        marketplace_fee_bps: u16,
        decimals: u8,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority = next_account_info(account_info_iter)?;
        let token_mint = next_account_info(account_info_iter)?;
        let collection = next_account_info(account_info_iter)?;
        let creator = next_account_info(account_info_iter)?;
        let fee_vault = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !authority.is_signer {
            return Err(ClawPegError::InvalidAuthority.into());
        }
        if peg_unit == 0 || max_pegs == 0 {
            return Err(ClawPegError::InvalidCapacity.into());
        }

        let (expected_collection, bump) =
            Pubkey::find_program_address(&[b"cpeg", token_mint.key.as_ref()], program_id);
        if expected_collection != *collection.key {
            return Err(ClawPegError::InvalidAccount.into());
        }

        create_pda_account(
            authority,
            collection,
            system_program,
            program_id,
            PEG_COLLECTION_SIZE,
            &[b"cpeg", token_mint.key.as_ref(), &[bump]],
        )?;

        let state = PegCollection {
            is_initialized: true,
            version: 1,
            bump,
            authority: *authority.key,
            token_mint: *token_mint.key,
            renderer_hash,
            collection_seed,
            peg_unit,
            max_pegs,
            total_pegs: 0,
            burned_pegs: 0,
            launch_fee_lamports,
            royalty_bps,
            marketplace_fee_bps,
            creator: *creator.key,
            fee_vault: *fee_vault.key,
            decimals,
        };
        state.pack(&mut collection.try_borrow_mut_data()?)?;
        msg!("PegCollectionInitialized");
        Ok(())
    }

    fn initialize_owner_peg(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let payer = next_account_info(account_info_iter)?;
        let collection = next_account_info(account_info_iter)?;
        let owner = next_account_info(account_info_iter)?;
        let owner_peg = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !payer.is_signer {
            return Err(ClawPegError::InvalidAuthority.into());
        }

        let (expected, bump) = Pubkey::find_program_address(
            &[b"owner-peg", collection.key.as_ref(), owner.key.as_ref()],
            program_id,
        );
        if expected != *owner_peg.key {
            return Err(ClawPegError::InvalidAccount.into());
        }

        create_pda_account(
            payer,
            owner_peg,
            system_program,
            program_id,
            OWNER_PEG_SIZE,
            &[
                b"owner-peg",
                collection.key.as_ref(),
                owner.key.as_ref(),
                &[bump],
            ],
        )?;

        let state = OwnerPeg {
            is_initialized: true,
            bump,
            collection: *collection.key,
            owner: *owner.key,
            synced_capacity: 0,
            active_count: 0,
            generation: 0,
            last_synced_slot: Clock::get()?.slot,
        };
        state.pack(&mut owner_peg.try_borrow_mut_data()?)?;
        msg!("OwnerPegInitialized");
        Ok(())
    }

    fn sync_peg(accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let owner = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;
        let owner_peg_account = next_account_info(account_info_iter)?;
        let owner_token_account = next_account_info(account_info_iter)?;

        if !owner.is_signer {
            return Err(ClawPegError::InvalidAuthority.into());
        }

        let collection = PegCollection::unpack(&collection_account.try_borrow_data()?)?;
        let mut owner_peg = OwnerPeg::unpack(&owner_peg_account.try_borrow_data()?)?;
        if owner_peg.collection != *collection_account.key || owner_peg.owner != *owner.key {
            return Err(ClawPegError::InvalidOwner.into());
        }

        let (token_owner, token_mint, token_amount) =
            parse_token_account(owner_token_account)?;
        if token_owner != *owner.key || token_mint != collection.token_mint {
            return Err(ClawPegError::InvalidMint.into());
        }

        let capacity = whole_capacity(token_amount, collection.peg_unit)?;
        if owner_peg.active_count > capacity {
            return Err(ClawPegError::CapacityExceeded.into());
        }

        owner_peg.synced_capacity = capacity;
        owner_peg.generation = owner_peg.generation.saturating_add(1);
        owner_peg.last_synced_slot = Clock::get()?.slot;
        owner_peg.pack(&mut owner_peg_account.try_borrow_mut_data()?)?;
        msg!("OwnerPegSynced");
        Ok(())
    }

    fn mint_peg(program_id: &Pubkey, accounts: &[AccountInfo], peg_id: u32) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let payer = next_account_info(account_info_iter)?;
        let owner = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;
        let owner_peg_account = next_account_info(account_info_iter)?;
        let owner_token_account = next_account_info(account_info_iter)?;
        let peg_record_account = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !payer.is_signer {
            return Err(ClawPegError::InvalidAuthority.into());
        }

        let mut collection = PegCollection::unpack(&collection_account.try_borrow_data()?)?;
        let mut owner_peg = OwnerPeg::unpack(&owner_peg_account.try_borrow_data()?)?;
        if owner_peg.collection != *collection_account.key || owner_peg.owner != *owner.key {
            return Err(ClawPegError::InvalidOwner.into());
        }
        if peg_id >= collection.max_pegs || collection.total_pegs >= collection.max_pegs {
            return Err(ClawPegError::InvalidCapacity.into());
        }

        let (token_owner, token_mint, token_amount) = parse_token_account(owner_token_account)?;
        if token_owner != *owner.key || token_mint != collection.token_mint {
            return Err(ClawPegError::InvalidMint.into());
        }

        let capacity = whole_capacity(token_amount, collection.peg_unit)?;
        if owner_peg.active_count.saturating_add(1) > capacity {
            return Err(ClawPegError::CapacityExceeded.into());
        }

        let peg_id_bytes = peg_id.to_le_bytes();
        let (expected_peg_record, bump) = Pubkey::find_program_address(
            &[b"peg", collection_account.key.as_ref(), &peg_id_bytes],
            program_id,
        );
        if expected_peg_record != *peg_record_account.key {
            return Err(ClawPegError::InvalidAccount.into());
        }

        create_pda_account(
            payer,
            peg_record_account,
            system_program,
            program_id,
            PEG_RECORD_SIZE,
            &[
                b"peg",
                collection_account.key.as_ref(),
                &peg_id_bytes,
                &[bump],
            ],
        )?;

        let now = Clock::get()?.slot;
        let peg = PegRecord {
            is_initialized: true,
            status: STATUS_ACTIVE,
            collection: *collection_account.key,
            owner: *owner.key,
            peg_id,
            seed: derive_seed(&collection.collection_seed, peg_id, owner.key),
            minted_slot: now,
            transferred_slot: 0,
            burned_slot: 0,
        };
        owner_peg.active_count = owner_peg.active_count.saturating_add(1);
        owner_peg.synced_capacity = capacity;
        owner_peg.last_synced_slot = now;
        collection.total_pegs = collection.total_pegs.saturating_add(1);

        peg.pack(&mut peg_record_account.try_borrow_mut_data()?)?;
        owner_peg.pack(&mut owner_peg_account.try_borrow_mut_data()?)?;
        collection.pack(&mut collection_account.try_borrow_mut_data()?)?;
        msg!("PegMinted");
        Ok(())
    }

    fn transfer_peg(program_id: &Pubkey, accounts: &[AccountInfo], peg_id: u32) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let source_owner = next_account_info(account_info_iter)?;
        let destination_owner = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;
        let source_owner_peg_account = next_account_info(account_info_iter)?;
        let destination_owner_peg_account = next_account_info(account_info_iter)?;
        let peg_record_account = next_account_info(account_info_iter)?;
        let source_token = next_account_info(account_info_iter)?;
        let mint = next_account_info(account_info_iter)?;
        let destination_token = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        let hook_program = next_account_info(account_info_iter)?;
        let validation = next_account_info(account_info_iter)?;

        if !source_owner.is_signer {
            return Err(ClawPegError::InvalidAuthority.into());
        }

        let collection = PegCollection::unpack(&collection_account.try_borrow_data()?)?;
        let mut source = OwnerPeg::unpack(&source_owner_peg_account.try_borrow_data()?)?;
        let mut destination = OwnerPeg::unpack(&destination_owner_peg_account.try_borrow_data()?)?;
        let mut peg = PegRecord::unpack(&peg_record_account.try_borrow_data()?)?;
        let (source_token_owner, source_mint, _) = parse_token_account(source_token)?;
        let (destination_token_owner, destination_mint, _) = parse_token_account(destination_token)?;

        if source.owner != *source_owner.key || destination.owner != *destination_owner.key {
            return Err(ClawPegError::InvalidOwner.into());
        }
        if collection.token_mint != *mint.key
            || source.collection != *collection_account.key
            || destination.collection != *collection_account.key
            || peg.collection != *collection_account.key
            || source_mint != collection.token_mint
            || destination_mint != collection.token_mint
        {
            return Err(ClawPegError::InvalidMint.into());
        }
        if source_token_owner != *source_owner.key || destination_token_owner != *destination_owner.key {
            return Err(ClawPegError::InvalidOwner.into());
        }
        if peg.peg_id != peg_id || peg.owner != *source_owner.key || peg.status != STATUS_ACTIVE {
            return Err(ClawPegError::PegNotOwned.into());
        }
        if *hook_program.key != *program_id
            || *validation.key != get_extra_account_metas_address(mint.key, program_id)
        {
            return Err(ClawPegError::InvalidAccount.into());
        }

        source.active_count = source.active_count.saturating_sub(1);
        destination.active_count = destination.active_count.saturating_add(1);
        peg.owner = *destination_owner.key;
        peg.transferred_slot = Clock::get()?.slot;

        source.pack(&mut source_owner_peg_account.try_borrow_mut_data()?)?;
        destination.pack(&mut destination_owner_peg_account.try_borrow_mut_data()?)?;
        peg.pack(&mut peg_record_account.try_borrow_mut_data()?)?;

        let mut transfer_instruction = token_instruction::transfer_checked(
            token_program.key,
            source_token.key,
            mint.key,
            destination_token.key,
            source_owner.key,
            &[],
            collection.peg_unit,
            collection.decimals,
        )?;
        transfer_instruction
            .accounts
            .push(AccountMeta::new(*collection_account.key, false));
        transfer_instruction
            .accounts
            .push(AccountMeta::new(*source_owner_peg_account.key, false));
        transfer_instruction
            .accounts
            .push(AccountMeta::new(*destination_owner_peg_account.key, false));
        transfer_instruction
            .accounts
            .push(AccountMeta::new_readonly(*hook_program.key, false));
        transfer_instruction
            .accounts
            .push(AccountMeta::new_readonly(*validation.key, false));
        invoke(
            &transfer_instruction,
            &[
                source_token.clone(),
                mint.clone(),
                destination_token.clone(),
                source_owner.clone(),
                collection_account.clone(),
                source_owner_peg_account.clone(),
                destination_owner_peg_account.clone(),
                hook_program.clone(),
                validation.clone(),
                token_program.clone(),
            ],
        )?;

        msg!("PegTransferred");
        Ok(())
    }

    fn burn_peg(accounts: &[AccountInfo], peg_id: u32) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let owner = next_account_info(account_info_iter)?;
        let owner_peg_account = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;
        let peg_record_account = next_account_info(account_info_iter)?;

        if !owner.is_signer {
            return Err(ClawPegError::InvalidAuthority.into());
        }

        let mut collection = PegCollection::unpack(&collection_account.try_borrow_data()?)?;
        let mut owner_peg = OwnerPeg::unpack(&owner_peg_account.try_borrow_data()?)?;
        let mut peg = PegRecord::unpack(&peg_record_account.try_borrow_data()?)?;

        if owner_peg.owner != *owner.key || peg.owner != *owner.key || peg.peg_id != peg_id {
            return Err(ClawPegError::PegNotOwned.into());
        }
        if peg.status == STATUS_BURNED {
            return Err(ClawPegError::PegBurned.into());
        }

        peg.status = STATUS_BURNED;
        peg.burned_slot = Clock::get()?.slot;
        owner_peg.active_count = owner_peg.active_count.saturating_sub(1);
        collection.burned_pegs = collection.burned_pegs.saturating_add(1);

        peg.pack(&mut peg_record_account.try_borrow_mut_data()?)?;
        owner_peg.pack(&mut owner_peg_account.try_borrow_mut_data()?)?;
        collection.pack(&mut collection_account.try_borrow_mut_data()?)?;
        msg!("PegBurned");
        Ok(())
    }

    fn initialize_transfer_hook_accounts(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        interface_order: bool,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let first = next_account_info(account_info_iter)?;
        let mint = next_account_info(account_info_iter)?;
        let third = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;
        let (payer, validation) = if interface_order {
            (third, first)
        } else {
            (first, third)
        };

        if !payer.is_signer {
            return Err(ClawPegError::InvalidAuthority.into());
        }

        let (expected_validation, bump_seed) =
            get_extra_account_metas_address_and_bump_seed(mint.key, program_id);
        if expected_validation != *validation.key {
            return Err(ClawPegError::InvalidAccount.into());
        }

        let account_metas = clawpeg_extra_account_metas()?;
        let account_size = ExtraAccountMetaList::size_of(account_metas.len())?;
        if validation.owner == program_id && validation.data_len() >= account_size {
            msg!("ClawPegTransferHookAccountsUpdated");
        } else {
            create_pda_account(
                payer,
                validation,
                system_program,
                program_id,
                account_size,
                &[b"extra-account-metas", mint.key.as_ref(), &[bump_seed]],
            )?;
        }

        let mut data = validation.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &account_metas)?;
        msg!("ClawPegTransferHookAccountsInitialized");
        Ok(())
    }

    fn execute_transfer_hook(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let source_token = next_account_info(account_info_iter)?;
        let mint = next_account_info(account_info_iter)?;
        let destination_token = next_account_info(account_info_iter)?;
        let _authority = next_account_info(account_info_iter)?;
        let validation = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;
        let source_owner_peg_account = next_account_info(account_info_iter)?;
        let destination_owner_peg_account = next_account_info(account_info_iter)?;

        check_token_account_is_transferring(source_token)?;
        check_token_account_is_transferring(destination_token)?;

        let expected_validation = get_extra_account_metas_address(mint.key, program_id);
        if expected_validation != *validation.key {
            return Err(ClawPegError::InvalidAccount.into());
        }
        let validation_data = validation.try_borrow_data()?;
        ExtraAccountMetaList::check_account_infos::<ExecuteInstruction>(
            accounts,
            &TransferHookInstruction::Execute { amount }.pack(),
            program_id,
            &validation_data,
        )?;

        let (expected_collection, _) =
            Pubkey::find_program_address(&[b"cpeg", mint.key.as_ref()], program_id);
        if expected_collection != *collection_account.key {
            return Err(ClawPegError::InvalidAccount.into());
        }

        let collection = PegCollection::unpack(&collection_account.try_borrow_data()?)?;
        if collection.token_mint != *mint.key {
            return Err(ClawPegError::InvalidMint.into());
        }

        let (source_owner, source_mint, source_amount) = parse_token_account(source_token)?;
        let (destination_owner, destination_mint, destination_amount) =
            parse_token_account(destination_token)?;
        if source_mint != collection.token_mint || destination_mint != collection.token_mint {
            return Err(ClawPegError::InvalidMint.into());
        }

        let source_active = read_active_count(source_owner_peg_account, &source_owner)?;
        let destination_active =
            read_active_count(destination_owner_peg_account, &destination_owner)?;

        let source_capacity = whole_capacity(source_amount, collection.peg_unit)?;
        let destination_capacity = whole_capacity(destination_amount, collection.peg_unit)?;
        if source_active > source_capacity || destination_active > destination_capacity {
            return Err(ClawPegError::CapacityExceeded.into());
        }

        msg!("PegTransferHookExecuted");
        msg!("Amount: {}", amount);
        Ok(())
    }
}

fn read_active_count(account: &AccountInfo, expected_owner: &Pubkey) -> Result<u32, ProgramError> {
    if account.data_is_empty() || account.data_len() < OWNER_PEG_SIZE {
        return Ok(0);
    }
    let data = account.try_borrow_data()?;
    if data[0] != 1 {
        return Ok(0);
    }
    let owner_peg = OwnerPeg::unpack(&data)?;
    if owner_peg.owner != *expected_owner {
        return Err(ClawPegError::InvalidOwner.into());
    }
    Ok(owner_peg.active_count)
}

fn create_pda_account<'a>(
    payer: &AccountInfo<'a>,
    new_account: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    owner: &Pubkey,
    size: usize,
    seeds: &[&[u8]],
) -> ProgramResult {
    if new_account.data_len() > 0 && !new_account.data_is_empty() {
        return Err(ClawPegError::InvalidAccount.into());
    }

    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(size);
    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            new_account.key,
            lamports,
            size as u64,
            owner,
        ),
        &[payer.clone(), new_account.clone(), system_program.clone()],
        &[seeds],
    )
}

fn whole_capacity(amount: u64, unit: u64) -> Result<u32, ProgramError> {
    if unit == 0 {
        return Err(ClawPegError::InvalidCapacity.into());
    }
    let whole = amount / unit;
    if whole > u32::MAX as u64 {
        return Err(ClawPegError::InvalidCapacity.into());
    }
    Ok(whole as u32)
}

fn parse_token_account(account: &AccountInfo) -> Result<(Pubkey, Pubkey, u64), ProgramError> {
    let data = account.try_borrow_data()?;
    let token_account = StateWithExtensions::<Account>::unpack(&data)?;
    Ok((
        token_account.base.owner,
        token_account.base.mint,
        token_account.base.amount,
    ))
}

fn check_token_account_is_transferring(account: &AccountInfo) -> ProgramResult {
    let data = account.try_borrow_data()?;
    let token_account = StateWithExtensions::<Account>::unpack(&data)?;
    let extension = token_account.get_extension::<TransferHookAccount>()?;
    if bool::from(extension.transferring) {
        Ok(())
    } else {
        Err(ClawPegError::InvalidAccount.into())
    }
}

fn clawpeg_extra_account_metas() -> Result<[ExtraAccountMeta; 3], ProgramError> {
    Ok([
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: b"cpeg".to_vec(),
                },
                Seed::AccountKey { index: 1 },
            ],
            false,
            false,
        )?,
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: b"owner-peg".to_vec(),
                },
                Seed::AccountKey { index: 5 },
                Seed::AccountData {
                    account_index: 0,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            true,
        )?,
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: b"owner-peg".to_vec(),
                },
                Seed::AccountKey { index: 5 },
                Seed::AccountData {
                    account_index: 2,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            true,
        )?,
    ])
}

#[allow(dead_code)]
fn derive_seed(collection_seed: &[u8; 32], peg_id: u32, owner: &Pubkey) -> [u8; 32] {
    let peg_id_bytes = peg_id.to_le_bytes();
    let hash = hashv(&[collection_seed, &peg_id_bytes, owner.as_ref()]);
    hash.to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::instruction::{unpack, ClawPegInstruction};
    use crate::state::{OwnerPeg, PegCollection, OWNER_PEG_SIZE, PEG_COLLECTION_SIZE};

    #[test]
    fn derives_required_transfer_hook_extra_metas() {
        let metas = clawpeg_extra_account_metas().expect("extra metas");
        assert_eq!(metas.len(), 3);
        assert!(!bool::from(metas[0].is_writable));
        assert!(bool::from(metas[1].is_writable));
        assert!(bool::from(metas[2].is_writable));
    }

    #[test]
    fn decodes_spl_execute_instruction() {
        let amount = 42u64;
        let data = TransferHookInstruction::Execute { amount }.pack();
        let decoded = unpack(&data).expect("decode execute");
        match decoded {
            ClawPegInstruction::ExecuteTransferHook { amount: decoded_amount } => {
                assert_eq!(decoded_amount, amount);
            }
            _ => panic!("expected execute transfer hook"),
        }
    }

    #[test]
    fn derives_deterministic_peg_seed() {
        let collection_seed = [7u8; 32];
        let owner = Pubkey::new_unique();
        assert_eq!(
            derive_seed(&collection_seed, 12, &owner),
            derive_seed(&collection_seed, 12, &owner)
        );
        assert_ne!(
            derive_seed(&collection_seed, 12, &owner),
            derive_seed(&collection_seed, 13, &owner)
        );
    }

    #[test]
    fn whole_capacity_floors_correctly() {
        assert_eq!(whole_capacity(0, 1_000_000_000).unwrap(), 0);
        assert_eq!(whole_capacity(999_999_999, 1_000_000_000).unwrap(), 0);
        assert_eq!(whole_capacity(1_000_000_000, 1_000_000_000).unwrap(), 1);
        assert_eq!(whole_capacity(5_500_000_000, 1_000_000_000).unwrap(), 5);
        assert_eq!(whole_capacity(u64::MAX, 1).is_err(), true);
        assert_eq!(whole_capacity(100, 0).is_err(), true);
    }

    #[test]
    fn collection_state_roundtrip_preserves_layout() {
        let state = PegCollection {
            is_initialized: true,
            version: 1,
            bump: 250,
            authority: Pubkey::new_unique(),
            token_mint: Pubkey::new_unique(),
            renderer_hash: [9u8; 32],
            collection_seed: [3u8; 32],
            peg_unit: 1_000_000_000,
            max_pegs: 10_000,
            total_pegs: 42,
            burned_pegs: 7,
            launch_fee_lamports: 50_000_000,
            royalty_bps: 500,
            marketplace_fee_bps: 200,
            creator: Pubkey::new_unique(),
            fee_vault: Pubkey::new_unique(),
            decimals: 9,
        };
        let mut buf = vec![0u8; PEG_COLLECTION_SIZE];
        state.pack(&mut buf).expect("pack");
        let restored = PegCollection::unpack(&buf).expect("unpack");
        assert_eq!(restored, state);
        // critical for cpeg-market parser: check exact byte offsets
        assert_eq!(&buf[131..139], &state.peg_unit.to_le_bytes());
        assert_eq!(&buf[159..161], &state.royalty_bps.to_le_bytes());
        assert_eq!(&buf[161..163], &state.marketplace_fee_bps.to_le_bytes());
        assert_eq!(&buf[163..195], state.creator.as_ref());
        assert_eq!(&buf[195..227], state.fee_vault.as_ref());
        assert_eq!(buf[227], state.decimals);
    }

    #[test]
    fn owner_peg_roundtrip() {
        let state = OwnerPeg {
            is_initialized: true,
            bump: 254,
            collection: Pubkey::new_unique(),
            owner: Pubkey::new_unique(),
            synced_capacity: 5,
            active_count: 3,
            generation: 11,
            last_synced_slot: 12345,
        };
        let mut buf = vec![0u8; OWNER_PEG_SIZE];
        state.pack(&mut buf).expect("pack");
        let restored = OwnerPeg::unpack(&buf).expect("unpack");
        assert_eq!(restored, state);
    }
}
