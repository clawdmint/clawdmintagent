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
    cpeg_error::ClawPegError,
    cpeg_instruction::{unpack, ClawPegInstruction},
    cpeg_state::{
        MarketListing, OwnerPeg, PegCollection, PegRecord, TradeArtRecord, LISTING_STATUS_ACTIVE,
        LISTING_STATUS_CANCELLED, LISTING_STATUS_FILLED, MARKET_LISTING_SIZE, OWNER_PEG_SIZE,
        PEG_COLLECTION_SIZE, PEG_RECORD_SIZE, STATUS_ACTIVE, STATUS_BURNED, TRADE_ART_RECORD_SIZE,
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
            ClawPegInstruction::RecordTradeArt {
                trade_index,
                amount_in,
                amount_out,
            } => Self::record_trade_art(program_id, accounts, trade_index, amount_in, amount_out),
            ClawPegInstruction::ListPegEscrow {
                peg_id,
                price_lamports,
            } => Self::list_peg_escrow(program_id, accounts, peg_id, price_lamports),
            ClawPegInstruction::BuyPegEscrow { peg_id } => {
                Self::buy_peg_escrow(program_id, accounts, peg_id)
            }
            ClawPegInstruction::CancelPegEscrow { peg_id } => {
                Self::cancel_peg_escrow(program_id, accounts, peg_id)
            }
            ClawPegInstruction::LockPegEscrow { peg_id } => {
                Self::lock_peg_escrow(program_id, accounts, peg_id)
            }
            ClawPegInstruction::ReleasePegEscrow { peg_id } => {
                Self::release_peg_escrow(program_id, accounts, peg_id)
            }
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

    fn record_trade_art(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        trade_index: u64,
        amount_in: u64,
        amount_out: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let payer = next_account_info(account_info_iter)?;
        let trader = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;
        let trade_art_account = next_account_info(account_info_iter)?;
        let input_mint = next_account_info(account_info_iter)?;
        let output_mint = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !payer.is_signer || !trader.is_signer {
            return Err(ClawPegError::InvalidAuthority.into());
        }
        if amount_in == 0 || amount_out == 0 {
            return Err(ClawPegError::InvalidCapacity.into());
        }

        let collection = PegCollection::unpack(&collection_account.try_borrow_data()?)?;
        if !collection.is_initialized {
            return Err(ClawPegError::InvalidAccount.into());
        }

        let trade_index_bytes = trade_index.to_le_bytes();
        let (expected, bump) = Pubkey::find_program_address(
            &[
                b"trade-art",
                collection_account.key.as_ref(),
                &trade_index_bytes,
            ],
            program_id,
        );
        if expected != *trade_art_account.key {
            return Err(ClawPegError::InvalidAccount.into());
        }

        // Idempotent guard: a trade-art PDA can be claimed exactly once. Subsequent calls
        // (e.g. duplicate market fills, retried CPIs, or back-to-back buys for the same
        // peg_id when the cpeg-market namespace overlaps a manual entry) MUST NOT brick
        // the outer transaction. If the account is already initialized as a TradeArtRecord
        // owned by this program, we no-op and return Ok.
        if !trade_art_account.data_is_empty() {
            if trade_art_account.owner != program_id {
                return Err(ClawPegError::InvalidAccount.into());
            }
            let existing = TradeArtRecord::unpack(&trade_art_account.try_borrow_data()?)?;
            if !existing.is_initialized || existing.collection != *collection_account.key {
                return Err(ClawPegError::InvalidAccount.into());
            }
            msg!("TradeArtAlreadyRecorded");
            msg!("TradeIndex: {}", trade_index);
            msg!("TradeArt: {}", trade_art_account.key);
            return Ok(());
        }

        create_pda_account(
            payer,
            trade_art_account,
            system_program,
            program_id,
            TRADE_ART_RECORD_SIZE,
            &[
                b"trade-art",
                collection_account.key.as_ref(),
                &trade_index_bytes,
                &[bump],
            ],
        )?;

        let slot = Clock::get()?.slot;
        let trade_art = TradeArtRecord {
            is_initialized: true,
            version: 1,
            bump,
            collection: *collection_account.key,
            trader: *trader.key,
            input_mint: *input_mint.key,
            output_mint: *output_mint.key,
            trade_index,
            amount_in,
            amount_out,
            slot,
            seed: derive_trade_art_seed(
                &collection.collection_seed,
                collection_account.key,
                trader.key,
                input_mint.key,
                output_mint.key,
                trade_index,
                amount_in,
                amount_out,
                slot,
            ),
        };
        trade_art.pack(&mut trade_art_account.try_borrow_mut_data()?)?;
        msg!("TradeArtGenerated");
        msg!("TradeIndex: {}", trade_index);
        msg!("TradeArt: {}", trade_art_account.key);
        Ok(())
    }

    fn list_peg_escrow(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        peg_id: u32,
        price_lamports: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let seller = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;
        let listing_account = next_account_info(account_info_iter)?;
        let seller_owner_peg_account = next_account_info(account_info_iter)?;
        let escrow_owner_peg_account = next_account_info(account_info_iter)?;
        let peg_record_account = next_account_info(account_info_iter)?;
        let seller_token = next_account_info(account_info_iter)?;
        let escrow_token = next_account_info(account_info_iter)?;
        let mint = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        let hook_program = next_account_info(account_info_iter)?;
        let validation = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !seller.is_signer || price_lamports == 0 {
            return Err(ClawPegError::InvalidAuthority.into());
        }

        let collection = PegCollection::unpack(&collection_account.try_borrow_data()?)?;
        let mut seller_owner_peg = OwnerPeg::unpack(&seller_owner_peg_account.try_borrow_data()?)?;
        let mut peg = PegRecord::unpack(&peg_record_account.try_borrow_data()?)?;
        if collection.token_mint != *mint.key || peg.collection != *collection_account.key {
            return Err(ClawPegError::InvalidMint.into());
        }
        if seller_owner_peg.owner != *seller.key || seller_owner_peg.collection != *collection_account.key {
            return Err(ClawPegError::InvalidOwner.into());
        }
        if peg.peg_id != peg_id || peg.owner != *seller.key || peg.status != STATUS_ACTIVE {
            return Err(ClawPegError::PegNotOwned.into());
        }

        let peg_id_bytes = peg_id.to_le_bytes();
        let (expected_listing, listing_bump) = Pubkey::find_program_address(
            &[b"market-listing", collection_account.key.as_ref(), &peg_id_bytes],
            program_id,
        );
        if expected_listing != *listing_account.key {
            return Err(ClawPegError::InvalidAccount.into());
        }
        let (expected_escrow_owner_peg, escrow_owner_peg_bump) = Pubkey::find_program_address(
            &[
                b"owner-peg",
                collection_account.key.as_ref(),
                listing_account.key.as_ref(),
            ],
            program_id,
        );
        if expected_escrow_owner_peg != *escrow_owner_peg_account.key {
            return Err(ClawPegError::InvalidAccount.into());
        }

        create_pda_account(
            seller,
            listing_account,
            system_program,
            program_id,
            MARKET_LISTING_SIZE,
            &[
                b"market-listing",
                collection_account.key.as_ref(),
                &peg_id_bytes,
                &[listing_bump],
            ],
        )?;
        create_pda_account(
            seller,
            escrow_owner_peg_account,
            system_program,
            program_id,
            OWNER_PEG_SIZE,
            &[
                b"owner-peg",
                collection_account.key.as_ref(),
                listing_account.key.as_ref(),
                &[escrow_owner_peg_bump],
            ],
        )?;

        let now = Clock::get()?.slot;
        let escrow_owner_peg = OwnerPeg {
            is_initialized: true,
            bump: escrow_owner_peg_bump,
            collection: *collection_account.key,
            owner: *listing_account.key,
            synced_capacity: 1,
            active_count: 1,
            generation: 1,
            last_synced_slot: now,
        };
        seller_owner_peg.active_count = seller_owner_peg.active_count.saturating_sub(1);
        seller_owner_peg.last_synced_slot = now;
        peg.owner = *listing_account.key;
        peg.transferred_slot = now;

        let listing = MarketListing {
            is_initialized: true,
            version: 1,
            bump: listing_bump,
            status: LISTING_STATUS_ACTIVE,
            collection: *collection_account.key,
            seller: *seller.key,
            escrow_owner: *listing_account.key,
            token_mint: *mint.key,
            peg_id,
            price_lamports,
            created_slot: now,
            closed_slot: 0,
        };

        listing.pack(&mut listing_account.try_borrow_mut_data()?)?;
        seller_owner_peg.pack(&mut seller_owner_peg_account.try_borrow_mut_data()?)?;
        escrow_owner_peg.pack(&mut escrow_owner_peg_account.try_borrow_mut_data()?)?;
        peg.pack(&mut peg_record_account.try_borrow_mut_data()?)?;

        let transfer_instruction = token_transfer_checked_with_hook(
            token_program.key,
            seller_token.key,
            mint.key,
            escrow_token.key,
            seller.key,
            collection.peg_unit,
            collection.decimals,
            collection_account.key,
            seller_owner_peg_account.key,
            escrow_owner_peg_account.key,
            hook_program.key,
            validation.key,
        )?;
        invoke(
            &transfer_instruction,
            &[
                seller_token.clone(),
                mint.clone(),
                escrow_token.clone(),
                seller.clone(),
                collection_account.clone(),
                seller_owner_peg_account.clone(),
                escrow_owner_peg_account.clone(),
                hook_program.clone(),
                validation.clone(),
                token_program.clone(),
            ],
        )?;

        msg!("PegListed");
        Ok(())
    }

    fn buy_peg_escrow(program_id: &Pubkey, accounts: &[AccountInfo], peg_id: u32) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let buyer = next_account_info(account_info_iter)?;
        let seller = next_account_info(account_info_iter)?;
        let creator = next_account_info(account_info_iter)?;
        let fee_vault = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;
        let listing_account = next_account_info(account_info_iter)?;
        let buyer_owner_peg_account = next_account_info(account_info_iter)?;
        let escrow_owner_peg_account = next_account_info(account_info_iter)?;
        let peg_record_account = next_account_info(account_info_iter)?;
        let escrow_token = next_account_info(account_info_iter)?;
        let buyer_token = next_account_info(account_info_iter)?;
        let mint = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        let hook_program = next_account_info(account_info_iter)?;
        let validation = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !buyer.is_signer {
            return Err(ClawPegError::InvalidAuthority.into());
        }

        let collection = PegCollection::unpack(&collection_account.try_borrow_data()?)?;
        let mut listing = MarketListing::unpack(&listing_account.try_borrow_data()?)?;
        let mut buyer_owner_peg = if buyer_owner_peg_account.data_len() >= OWNER_PEG_SIZE {
            OwnerPeg::unpack(&buyer_owner_peg_account.try_borrow_data()?)?
        } else {
            let (expected_buyer_owner_peg, buyer_owner_peg_bump) = Pubkey::find_program_address(
                &[b"owner-peg", collection_account.key.as_ref(), buyer.key.as_ref()],
                program_id,
            );
            if expected_buyer_owner_peg != *buyer_owner_peg_account.key {
                return Err(ClawPegError::InvalidAccount.into());
            }
            create_pda_account(
                buyer,
                buyer_owner_peg_account,
                system_program,
                program_id,
                OWNER_PEG_SIZE,
                &[
                    b"owner-peg",
                    collection_account.key.as_ref(),
                    buyer.key.as_ref(),
                    &[buyer_owner_peg_bump],
                ],
            )?;
            OwnerPeg {
                is_initialized: true,
                bump: buyer_owner_peg_bump,
                collection: *collection_account.key,
                owner: *buyer.key,
                synced_capacity: 0,
                active_count: 0,
                generation: 0,
                last_synced_slot: Clock::get()?.slot,
            }
        };
        let mut escrow_owner_peg = OwnerPeg::unpack(&escrow_owner_peg_account.try_borrow_data()?)?;
        let mut peg = PegRecord::unpack(&peg_record_account.try_borrow_data()?)?;

        validate_listing(program_id, collection_account.key, listing_account.key, &listing, peg_id)?;
        if listing.status != LISTING_STATUS_ACTIVE
            || listing.collection != *collection_account.key
            || listing.token_mint != *mint.key
            || listing.seller != *seller.key
            || collection.creator != *creator.key
            || collection.fee_vault != *fee_vault.key
            || peg.owner != *listing_account.key
            || peg.peg_id != peg_id
        {
            return Err(ClawPegError::InvalidAccount.into());
        }
        if buyer_owner_peg.owner != *buyer.key || escrow_owner_peg.owner != *listing_account.key {
            return Err(ClawPegError::InvalidOwner.into());
        }

        pay_market_sale(
            buyer,
            seller,
            creator,
            fee_vault,
            listing.price_lamports,
            collection.marketplace_fee_bps,
            collection.royalty_bps,
        )?;

        let now = Clock::get()?.slot;
        escrow_owner_peg.active_count = escrow_owner_peg.active_count.saturating_sub(1);
        escrow_owner_peg.last_synced_slot = now;
        buyer_owner_peg.active_count = buyer_owner_peg.active_count.saturating_add(1);
        buyer_owner_peg.synced_capacity = buyer_owner_peg.synced_capacity.saturating_add(1);
        buyer_owner_peg.last_synced_slot = now;
        peg.owner = *buyer.key;
        peg.transferred_slot = now;
        listing.status = LISTING_STATUS_FILLED;
        listing.closed_slot = now;

        listing.pack(&mut listing_account.try_borrow_mut_data()?)?;
        escrow_owner_peg.pack(&mut escrow_owner_peg_account.try_borrow_mut_data()?)?;
        buyer_owner_peg.pack(&mut buyer_owner_peg_account.try_borrow_mut_data()?)?;
        peg.pack(&mut peg_record_account.try_borrow_mut_data()?)?;

        let transfer_instruction = token_transfer_checked_with_hook(
            token_program.key,
            escrow_token.key,
            mint.key,
            buyer_token.key,
            listing_account.key,
            collection.peg_unit,
            collection.decimals,
            collection_account.key,
            escrow_owner_peg_account.key,
            buyer_owner_peg_account.key,
            hook_program.key,
            validation.key,
        )?;
        let peg_id_bytes = peg_id.to_le_bytes();
        invoke_signed(
            &transfer_instruction,
            &[
                escrow_token.clone(),
                mint.clone(),
                buyer_token.clone(),
                listing_account.clone(),
                collection_account.clone(),
                escrow_owner_peg_account.clone(),
                buyer_owner_peg_account.clone(),
                hook_program.clone(),
                validation.clone(),
                token_program.clone(),
            ],
            &[&[
                b"market-listing",
                collection_account.key.as_ref(),
                &peg_id_bytes,
                &[listing.bump],
            ]],
        )?;

        msg!("PegSold");
        Ok(())
    }

    fn cancel_peg_escrow(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        peg_id: u32,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let seller = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;
        let listing_account = next_account_info(account_info_iter)?;
        let seller_owner_peg_account = next_account_info(account_info_iter)?;
        let escrow_owner_peg_account = next_account_info(account_info_iter)?;
        let peg_record_account = next_account_info(account_info_iter)?;
        let escrow_token = next_account_info(account_info_iter)?;
        let seller_token = next_account_info(account_info_iter)?;
        let mint = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        let hook_program = next_account_info(account_info_iter)?;
        let validation = next_account_info(account_info_iter)?;

        if !seller.is_signer {
            return Err(ClawPegError::InvalidAuthority.into());
        }

        let collection = PegCollection::unpack(&collection_account.try_borrow_data()?)?;
        let mut listing = MarketListing::unpack(&listing_account.try_borrow_data()?)?;
        let mut seller_owner_peg = OwnerPeg::unpack(&seller_owner_peg_account.try_borrow_data()?)?;
        let mut escrow_owner_peg = OwnerPeg::unpack(&escrow_owner_peg_account.try_borrow_data()?)?;
        let mut peg = PegRecord::unpack(&peg_record_account.try_borrow_data()?)?;

        validate_listing(program_id, collection_account.key, listing_account.key, &listing, peg_id)?;
        if listing.status != LISTING_STATUS_ACTIVE
            || listing.seller != *seller.key
            || listing.token_mint != *mint.key
            || peg.owner != *listing_account.key
            || peg.peg_id != peg_id
            || seller_owner_peg.owner != *seller.key
            || escrow_owner_peg.owner != *listing_account.key
        {
            return Err(ClawPegError::InvalidAccount.into());
        }

        let now = Clock::get()?.slot;
        escrow_owner_peg.active_count = escrow_owner_peg.active_count.saturating_sub(1);
        escrow_owner_peg.last_synced_slot = now;
        seller_owner_peg.active_count = seller_owner_peg.active_count.saturating_add(1);
        seller_owner_peg.synced_capacity = seller_owner_peg.synced_capacity.saturating_add(1);
        seller_owner_peg.last_synced_slot = now;
        peg.owner = *seller.key;
        peg.transferred_slot = now;
        listing.status = LISTING_STATUS_CANCELLED;
        listing.closed_slot = now;

        listing.pack(&mut listing_account.try_borrow_mut_data()?)?;
        escrow_owner_peg.pack(&mut escrow_owner_peg_account.try_borrow_mut_data()?)?;
        seller_owner_peg.pack(&mut seller_owner_peg_account.try_borrow_mut_data()?)?;
        peg.pack(&mut peg_record_account.try_borrow_mut_data()?)?;

        let transfer_instruction = token_transfer_checked_with_hook(
            token_program.key,
            escrow_token.key,
            mint.key,
            seller_token.key,
            listing_account.key,
            collection.peg_unit,
            collection.decimals,
            collection_account.key,
            escrow_owner_peg_account.key,
            seller_owner_peg_account.key,
            hook_program.key,
            validation.key,
        )?;
        let peg_id_bytes = peg_id.to_le_bytes();
        invoke_signed(
            &transfer_instruction,
            &[
                escrow_token.clone(),
                mint.clone(),
                seller_token.clone(),
                listing_account.clone(),
                collection_account.clone(),
                escrow_owner_peg_account.clone(),
                seller_owner_peg_account.clone(),
                hook_program.clone(),
                validation.clone(),
                token_program.clone(),
            ],
            &[&[
                b"market-listing",
                collection_account.key.as_ref(),
                &peg_id_bytes,
                &[listing.bump],
            ]],
        )?;

        msg!("PegListingCancelled");
        Ok(())
    }

    fn lock_peg_escrow(program_id: &Pubkey, accounts: &[AccountInfo], peg_id: u32) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let seller = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;
        let escrow_owner = next_account_info(account_info_iter)?;
        let seller_owner_peg_account = next_account_info(account_info_iter)?;
        let escrow_owner_peg_account = next_account_info(account_info_iter)?;
        let peg_record_account = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !seller.is_signer {
            return Err(ClawPegError::InvalidAuthority.into());
        }

        let mut seller_owner_peg = OwnerPeg::unpack(&seller_owner_peg_account.try_borrow_data()?)?;
        let mut peg = PegRecord::unpack(&peg_record_account.try_borrow_data()?)?;
        if seller_owner_peg.owner != *seller.key
            || seller_owner_peg.collection != *collection_account.key
            || peg.owner != *seller.key
            || peg.collection != *collection_account.key
            || peg.peg_id != peg_id
            || peg.status != STATUS_ACTIVE
        {
            return Err(ClawPegError::PegNotOwned.into());
        }

        let (expected_escrow_owner_peg, escrow_owner_peg_bump) = Pubkey::find_program_address(
            &[
                b"owner-peg",
                collection_account.key.as_ref(),
                escrow_owner.key.as_ref(),
            ],
            program_id,
        );
        if expected_escrow_owner_peg != *escrow_owner_peg_account.key {
            return Err(ClawPegError::InvalidAccount.into());
        }

        if escrow_owner_peg_account.data_len() == 0 || escrow_owner_peg_account.data_is_empty() {
            create_pda_account(
                seller,
                escrow_owner_peg_account,
                system_program,
                program_id,
                OWNER_PEG_SIZE,
                &[
                    b"owner-peg",
                    collection_account.key.as_ref(),
                    escrow_owner.key.as_ref(),
                    &[escrow_owner_peg_bump],
                ],
            )?;
        }

        let mut escrow_owner_peg = if escrow_owner_peg_account.data_len() >= OWNER_PEG_SIZE {
            OwnerPeg::unpack(&escrow_owner_peg_account.try_borrow_data()?)?
        } else {
            return Err(ClawPegError::InvalidAccount.into());
        };
        if escrow_owner_peg.is_initialized && escrow_owner_peg.owner != *escrow_owner.key {
            return Err(ClawPegError::InvalidOwner.into());
        }

        let now = Clock::get()?.slot;
        escrow_owner_peg.is_initialized = true;
        escrow_owner_peg.bump = escrow_owner_peg_bump;
        escrow_owner_peg.collection = *collection_account.key;
        escrow_owner_peg.owner = *escrow_owner.key;
        escrow_owner_peg.synced_capacity = escrow_owner_peg.synced_capacity.saturating_add(1);
        escrow_owner_peg.active_count = escrow_owner_peg.active_count.saturating_add(1);
        escrow_owner_peg.generation = escrow_owner_peg.generation.saturating_add(1);
        escrow_owner_peg.last_synced_slot = now;
        seller_owner_peg.active_count = seller_owner_peg.active_count.saturating_sub(1);
        seller_owner_peg.last_synced_slot = now;
        peg.owner = *escrow_owner.key;
        peg.transferred_slot = now;

        seller_owner_peg.pack(&mut seller_owner_peg_account.try_borrow_mut_data()?)?;
        escrow_owner_peg.pack(&mut escrow_owner_peg_account.try_borrow_mut_data()?)?;
        peg.pack(&mut peg_record_account.try_borrow_mut_data()?)?;
        msg!("PegEscrowLocked");
        Ok(())
    }

    fn release_peg_escrow(program_id: &Pubkey, accounts: &[AccountInfo], peg_id: u32) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let escrow_owner = next_account_info(account_info_iter)?;
        let destination_owner = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;
        let escrow_owner_peg_account = next_account_info(account_info_iter)?;
        let destination_owner_peg_account = next_account_info(account_info_iter)?;
        let peg_record_account = next_account_info(account_info_iter)?;
        let payer = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !escrow_owner.is_signer {
            return Err(ClawPegError::InvalidAuthority.into());
        }

        let mut escrow_owner_peg = OwnerPeg::unpack(&escrow_owner_peg_account.try_borrow_data()?)?;
        let mut peg = PegRecord::unpack(&peg_record_account.try_borrow_data()?)?;
        if escrow_owner_peg.owner != *escrow_owner.key
            || escrow_owner_peg.collection != *collection_account.key
            || peg.owner != *escrow_owner.key
            || peg.collection != *collection_account.key
            || peg.peg_id != peg_id
            || peg.status != STATUS_ACTIVE
        {
            return Err(ClawPegError::PegNotOwned.into());
        }

        let (expected_destination_owner_peg, destination_owner_peg_bump) = Pubkey::find_program_address(
            &[
                b"owner-peg",
                collection_account.key.as_ref(),
                destination_owner.key.as_ref(),
            ],
            program_id,
        );
        if expected_destination_owner_peg != *destination_owner_peg_account.key {
            return Err(ClawPegError::InvalidAccount.into());
        }
        if destination_owner_peg_account.data_len() == 0 || destination_owner_peg_account.data_is_empty() {
            create_pda_account(
                payer,
                destination_owner_peg_account,
                system_program,
                program_id,
                OWNER_PEG_SIZE,
                &[
                    b"owner-peg",
                    collection_account.key.as_ref(),
                    destination_owner.key.as_ref(),
                    &[destination_owner_peg_bump],
                ],
            )?;
        }

        let mut destination_owner_peg = OwnerPeg::unpack(&destination_owner_peg_account.try_borrow_data()?)?;
        let now = Clock::get()?.slot;
        destination_owner_peg.is_initialized = true;
        destination_owner_peg.bump = destination_owner_peg_bump;
        destination_owner_peg.collection = *collection_account.key;
        destination_owner_peg.owner = *destination_owner.key;
        destination_owner_peg.synced_capacity = destination_owner_peg.synced_capacity.saturating_add(1);
        destination_owner_peg.active_count = destination_owner_peg.active_count.saturating_add(1);
        destination_owner_peg.generation = destination_owner_peg.generation.saturating_add(1);
        destination_owner_peg.last_synced_slot = now;
        escrow_owner_peg.active_count = escrow_owner_peg.active_count.saturating_sub(1);
        escrow_owner_peg.last_synced_slot = now;
        peg.owner = *destination_owner.key;
        peg.transferred_slot = now;

        escrow_owner_peg.pack(&mut escrow_owner_peg_account.try_borrow_mut_data()?)?;
        destination_owner_peg.pack(&mut destination_owner_peg_account.try_borrow_mut_data()?)?;
        peg.pack(&mut peg_record_account.try_borrow_mut_data()?)?;
        msg!("PegEscrowReleased");
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

        let source = OwnerPeg::unpack(&source_owner_peg_account.try_borrow_data()?)?;
        let destination = OwnerPeg::unpack(&destination_owner_peg_account.try_borrow_data()?)?;
        if source.owner != source_owner || destination.owner != destination_owner {
            return Err(ClawPegError::InvalidOwner.into());
        }

        let source_capacity = whole_capacity(source_amount, collection.peg_unit)?;
        let destination_capacity = whole_capacity(destination_amount, collection.peg_unit)?;
        if source.active_count > source_capacity || destination.active_count > destination_capacity {
            return Err(ClawPegError::CapacityExceeded.into());
        }

        msg!("PegTransferHookExecuted");
        msg!("Amount: {}", amount);
        Ok(())
    }
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

#[allow(clippy::too_many_arguments)]
fn token_transfer_checked_with_hook(
    token_program: &Pubkey,
    source_token: &Pubkey,
    mint: &Pubkey,
    destination_token: &Pubkey,
    authority: &Pubkey,
    amount: u64,
    decimals: u8,
    collection: &Pubkey,
    source_owner_peg: &Pubkey,
    destination_owner_peg: &Pubkey,
    hook_program: &Pubkey,
    validation: &Pubkey,
) -> Result<solana_program::instruction::Instruction, ProgramError> {
    let mut instruction = token_instruction::transfer_checked(
        token_program,
        source_token,
        mint,
        destination_token,
        authority,
        &[],
        amount,
        decimals,
    )?;
    instruction
        .accounts
        .push(AccountMeta::new_readonly(*collection, false));
    instruction.accounts.push(AccountMeta::new(*source_owner_peg, false));
    instruction
        .accounts
        .push(AccountMeta::new(*destination_owner_peg, false));
    instruction
        .accounts
        .push(AccountMeta::new_readonly(*hook_program, false));
    instruction
        .accounts
        .push(AccountMeta::new_readonly(*validation, false));
    Ok(instruction)
}

fn validate_listing(
    program_id: &Pubkey,
    collection: &Pubkey,
    listing_account: &Pubkey,
    listing: &MarketListing,
    peg_id: u32,
) -> ProgramResult {
    let peg_id_bytes = peg_id.to_le_bytes();
    let (expected_listing, _) =
        Pubkey::find_program_address(&[b"market-listing", collection.as_ref(), &peg_id_bytes], program_id);
    if expected_listing != *listing_account
        || listing.collection != *collection
        || listing.peg_id != peg_id
        || listing.escrow_owner != *listing_account
    {
        return Err(ClawPegError::InvalidAccount.into());
    }
    Ok(())
}

fn checked_bps(amount: u64, bps: u16) -> Result<u64, ProgramError> {
    let value = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or(ClawPegError::InvalidCapacity)?
        / 10_000u128;
    if value > u64::MAX as u128 {
        return Err(ClawPegError::InvalidCapacity.into());
    }
    Ok(value as u64)
}

fn pay_market_sale<'a>(
    buyer: &AccountInfo<'a>,
    seller: &AccountInfo<'a>,
    creator: &AccountInfo<'a>,
    fee_vault: &AccountInfo<'a>,
    price_lamports: u64,
    marketplace_fee_bps: u16,
    royalty_bps: u16,
) -> ProgramResult {
    let fee = checked_bps(price_lamports, marketplace_fee_bps)?;
    let royalty = checked_bps(price_lamports, royalty_bps)?;
    let seller_amount = price_lamports
        .checked_sub(fee)
        .and_then(|value| value.checked_sub(royalty))
        .ok_or(ClawPegError::InvalidCapacity)?;

    if fee > 0 {
        invoke(
            &system_instruction::transfer(buyer.key, fee_vault.key, fee),
            &[buyer.clone(), fee_vault.clone()],
        )?;
    }
    if royalty > 0 {
        invoke(
            &system_instruction::transfer(buyer.key, creator.key, royalty),
            &[buyer.clone(), creator.clone()],
        )?;
    }
    if seller_amount > 0 {
        invoke(
            &system_instruction::transfer(buyer.key, seller.key, seller_amount),
            &[buyer.clone(), seller.clone()],
        )?;
    }
    Ok(())
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

#[allow(clippy::too_many_arguments)]
fn derive_trade_art_seed(
    collection_seed: &[u8; 32],
    collection: &Pubkey,
    trader: &Pubkey,
    input_mint: &Pubkey,
    output_mint: &Pubkey,
    trade_index: u64,
    amount_in: u64,
    amount_out: u64,
    slot: u64,
) -> [u8; 32] {
    let trade_index_bytes = trade_index.to_le_bytes();
    let amount_in_bytes = amount_in.to_le_bytes();
    let amount_out_bytes = amount_out.to_le_bytes();
    let slot_bytes = slot.to_le_bytes();
    let hash = hashv(&[
        collection_seed,
        collection.as_ref(),
        trader.as_ref(),
        input_mint.as_ref(),
        output_mint.as_ref(),
        &trade_index_bytes,
        &amount_in_bytes,
        &amount_out_bytes,
        &slot_bytes,
    ]);
    hash.to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cpeg_instruction::{unpack, ClawPegInstruction};

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
    fn derives_deterministic_trade_art_seed() {
        let collection_seed = [9u8; 32];
        let collection = Pubkey::new_unique();
        let trader = Pubkey::new_unique();
        let input_mint = Pubkey::new_unique();
        let output_mint = Pubkey::new_unique();
        let first = derive_trade_art_seed(
            &collection_seed,
            &collection,
            &trader,
            &input_mint,
            &output_mint,
            1,
            100,
            90,
            5,
        );
        let second = derive_trade_art_seed(
            &collection_seed,
            &collection,
            &trader,
            &input_mint,
            &output_mint,
            1,
            100,
            90,
            5,
        );
        let changed = derive_trade_art_seed(
            &collection_seed,
            &collection,
            &trader,
            &input_mint,
            &output_mint,
            2,
            100,
            90,
            5,
        );
        assert_eq!(first, second);
        assert_ne!(first, changed);
    }
}
