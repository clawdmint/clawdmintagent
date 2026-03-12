use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    pubkey::Pubkey,
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
};

use crate::{
    error::ClawdmintSolanaError,
    instruction::{unpack, ClawdmintInstruction},
    state::{CollectionAccount, COLLECTION_ACCOUNT_SIZE},
};

pub struct Processor;

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        match unpack(instruction_data)? {
            ClawdmintInstruction::InitializeCollection {
                collection_id,
                name,
                symbol,
                base_uri,
                max_supply,
                mint_price_lamports,
                royalty_bps,
                payout_address,
            } => Self::initialize_collection(
                program_id,
                accounts,
                collection_id,
                name,
                symbol,
                base_uri,
                max_supply,
                mint_price_lamports,
                royalty_bps,
                payout_address,
            ),
            ClawdmintInstruction::MintNft { quantity } => {
                Self::mint_nft(accounts, quantity)
            }
        }
    }

    fn initialize_collection(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        collection_id: String,
        name: String,
        symbol: String,
        base_uri: String,
        max_supply: u32,
        mint_price_lamports: u64,
        royalty_bps: u16,
        payout_address: [u8; 32],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !authority.is_signer {
            return Err(ClawdmintSolanaError::InvalidAuthority.into());
        }

        let (expected_collection, bump) = Pubkey::find_program_address(
            &[
                b"collection",
                authority.key.as_ref(),
                collection_id.as_bytes(),
            ],
            program_id,
        );

        if expected_collection != *collection_account.key {
            return Err(ClawdmintSolanaError::InvalidCollectionAccount.into());
        }

        if collection_account.data_len() > 0 && !collection_account.data_is_empty() {
            let current = CollectionAccount::unpack(&collection_account.try_borrow_data()?)?;
            if current.is_initialized {
                return Err(ClawdmintSolanaError::CollectionAlreadyInitialized.into());
            }
        }

        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(COLLECTION_ACCOUNT_SIZE);
        invoke_signed(
            &system_instruction::create_account(
                authority.key,
                collection_account.key,
                lamports,
                COLLECTION_ACCOUNT_SIZE as u64,
                program_id,
            ),
            &[authority.clone(), collection_account.clone(), system_program.clone()],
            &[&[
                b"collection",
                authority.key.as_ref(),
                collection_id.as_bytes(),
                &[bump],
            ]],
        )?;

        let state = CollectionAccount {
            is_initialized: true,
            authority: *authority.key,
            payout_address: Pubkey::new_from_array(payout_address),
            collection_id,
            name,
            symbol,
            base_uri,
            max_supply,
            total_minted: 0,
            mint_price_lamports,
            royalty_bps,
        };

        state.pack(&mut collection_account.try_borrow_mut_data()?)?;
        msg!("Collection initialized");
        Ok(())
    }

    fn mint_nft(accounts: &[AccountInfo], quantity: u32) -> ProgramResult {
        if quantity == 0 {
            return Err(ClawdmintSolanaError::InvalidQuantity.into());
        }

        let account_info_iter = &mut accounts.iter();
        let minter = next_account_info(account_info_iter)?;
        let collection_account = next_account_info(account_info_iter)?;

        if !minter.is_signer {
            return Err(ClawdmintSolanaError::InvalidAuthority.into());
        }

        let mut state = CollectionAccount::unpack(&collection_account.try_borrow_data()?)?;
        if state.total_minted.saturating_add(quantity) > state.max_supply {
            return Err(ClawdmintSolanaError::SoldOut.into());
        }

        state.total_minted = state.total_minted.saturating_add(quantity);
        state.pack(&mut collection_account.try_borrow_mut_data()?)?;
        msg!("Mint recorded");
        Ok(())
    }
}

