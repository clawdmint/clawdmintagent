use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
};
use spl_token_2022::instruction as token_instruction;

use crate::{
    instruction::{unpack, MarketInstruction},
    state::{MarketListing, MARKET_LISTING_SIZE, STATUS_ACTIVE},
};

pub struct Processor;

impl Processor {
    pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
        match unpack(data)? {
            MarketInstruction::List {
                peg_id,
                price_lamports,
            } => Self::list(program_id, accounts, peg_id, price_lamports),
            MarketInstruction::Buy { peg_id } => Self::buy(program_id, accounts, peg_id),
            MarketInstruction::Cancel { peg_id } => Self::cancel(program_id, accounts, peg_id),
        }
    }

    fn list(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        peg_id: u32,
        price_lamports: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let seller = next_account_info(account_info_iter)?;
        let collection = next_account_info(account_info_iter)?;
        let listing = next_account_info(account_info_iter)?;
        let seller_owner_peg = next_account_info(account_info_iter)?;
        let escrow_owner_peg = next_account_info(account_info_iter)?;
        let peg_record = next_account_info(account_info_iter)?;
        let seller_token = next_account_info(account_info_iter)?;
        let escrow_token = next_account_info(account_info_iter)?;
        let mint = next_account_info(account_info_iter)?;
        let cpeg_program = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        let hook_program = next_account_info(account_info_iter)?;
        let validation = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !seller.is_signer || price_lamports == 0 {
            return Err(ProgramError::MissingRequiredSignature);
        }
        let (expected_listing, bump) = listing_address(program_id, collection.key, peg_id);
        if expected_listing != *listing.key {
            return Err(ProgramError::InvalidSeeds);
        }
        create_pda_account(
            seller,
            listing,
            system_program,
            program_id,
            MARKET_LISTING_SIZE,
            &[b"listing", collection.key.as_ref(), &peg_id.to_le_bytes(), &[bump]],
        )?;
        let (peg_unit, decimals) = parse_cpeg_collection_config(&collection.try_borrow_data()?)?;

        invoke(
            &cpeg_lock_instruction(
                cpeg_program.key,
                seller.key,
                collection.key,
                listing.key,
                seller_owner_peg.key,
                escrow_owner_peg.key,
                peg_record.key,
                system_program.key,
                peg_id,
            ),
            &[
                seller.clone(),
                collection.clone(),
                listing.clone(),
                seller_owner_peg.clone(),
                escrow_owner_peg.clone(),
                peg_record.clone(),
                system_program.clone(),
                cpeg_program.clone(),
            ],
        )?;

        invoke(
            &token_transfer_with_hook(
                token_program.key,
                seller_token.key,
                mint.key,
                escrow_token.key,
                seller.key,
                peg_unit,
                decimals,
                collection.key,
                seller_owner_peg.key,
                escrow_owner_peg.key,
                hook_program.key,
                validation.key,
            )?,
            &[
                seller_token.clone(),
                mint.clone(),
                escrow_token.clone(),
                seller.clone(),
                collection.clone(),
                seller_owner_peg.clone(),
                escrow_owner_peg.clone(),
                hook_program.clone(),
                validation.clone(),
                token_program.clone(),
            ],
        )?;

        MarketListing {
            is_initialized: true,
            version: 1,
            bump,
            status: STATUS_ACTIVE,
            collection: *collection.key,
            seller: *seller.key,
            token_mint: *mint.key,
            escrow_token: *escrow_token.key,
            peg_id,
            price_lamports,
            closed_slot: 0,
        }
        .pack(&mut listing.try_borrow_mut_data()?)?;
        solana_program::msg!("CpegMarketListed");
        Ok(())
    }

    fn buy(program_id: &Pubkey, accounts: &[AccountInfo], peg_id: u32) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let buyer = next_account_info(account_info_iter)?;
        let seller = next_account_info(account_info_iter)?;
        let collection = next_account_info(account_info_iter)?;
        let listing = next_account_info(account_info_iter)?;
        let escrow_owner_peg = next_account_info(account_info_iter)?;
        let buyer_owner_peg = next_account_info(account_info_iter)?;
        let peg_record = next_account_info(account_info_iter)?;
        let escrow_token = next_account_info(account_info_iter)?;
        let buyer_token = next_account_info(account_info_iter)?;
        let mint = next_account_info(account_info_iter)?;
        let cpeg_program = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        let hook_program = next_account_info(account_info_iter)?;
        let validation = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;
        let creator = next_account_info(account_info_iter)?;
        let fee_vault = next_account_info(account_info_iter)?;
        let trade_art = next_account_info(account_info_iter)?;

        if !buyer.is_signer {
            solana_program::msg!("CpegMarketBuy: buyer is not a signer");
            return Err(ProgramError::MissingRequiredSignature);
        }
        if listing.data_is_empty() {
            solana_program::msg!("CpegMarketBuy: listing PDA has no data; was it ever created on-chain?");
            return Err(ProgramError::UninitializedAccount);
        }
        if collection.data_is_empty() {
            solana_program::msg!("CpegMarketBuy: collection account has no data");
            return Err(ProgramError::UninitializedAccount);
        }
        let state = MarketListing::unpack(&listing.try_borrow_data()?)?;
        let cfg = parse_cpeg_collection_config_full(&collection.try_borrow_data()?)?;
        let peg_unit = cfg.peg_unit;
        let decimals = cfg.decimals;
        let (expected_listing, bump) = listing_address(program_id, collection.key, peg_id);
        if expected_listing != *listing.key {
            solana_program::msg!("CpegMarketBuy: listing PDA mismatch (peg_id seed wrong?)");
            return Err(ProgramError::InvalidAccountData);
        }
        if state.status != STATUS_ACTIVE {
            solana_program::msg!("CpegMarketBuy: listing status is not ACTIVE ({})", state.status);
            return Err(ProgramError::InvalidAccountData);
        }
        if state.seller != *seller.key {
            solana_program::msg!("CpegMarketBuy: seller mismatch with on-chain state");
            return Err(ProgramError::InvalidAccountData);
        }
        if state.token_mint != *mint.key {
            solana_program::msg!("CpegMarketBuy: token mint mismatch with on-chain state");
            return Err(ProgramError::InvalidAccountData);
        }
        if state.escrow_token != *escrow_token.key {
            solana_program::msg!("CpegMarketBuy: escrow token mismatch with on-chain state");
            return Err(ProgramError::InvalidAccountData);
        }
        if cfg.creator != *creator.key {
            solana_program::msg!("CpegMarketBuy: creator account mismatch with collection config");
            return Err(ProgramError::InvalidAccountData);
        }
        if cfg.fee_vault != *fee_vault.key {
            solana_program::msg!("CpegMarketBuy: fee vault account mismatch with collection config");
            return Err(ProgramError::InvalidAccountData);
        }

        let (seller_amount, royalty_amount, protocol_fee) =
            split_payment(state.price_lamports, cfg.royalty_bps, cfg.marketplace_fee_bps)?;

        if seller_amount > 0 {
            invoke(
                &system_instruction::transfer(buyer.key, seller.key, seller_amount),
                &[buyer.clone(), seller.clone(), system_program.clone()],
            )?;
        }
        if royalty_amount > 0 {
            invoke(
                &system_instruction::transfer(buyer.key, creator.key, royalty_amount),
                &[buyer.clone(), creator.clone(), system_program.clone()],
            )?;
        }
        if protocol_fee > 0 {
            invoke(
                &system_instruction::transfer(buyer.key, fee_vault.key, protocol_fee),
                &[buyer.clone(), fee_vault.clone(), system_program.clone()],
            )?;
        }
        invoke_signed(
            &cpeg_release_instruction(
                cpeg_program.key,
                listing.key,
                buyer.key,
                collection.key,
                escrow_owner_peg.key,
                buyer_owner_peg.key,
                peg_record.key,
                buyer.key,
                system_program.key,
                peg_id,
            ),
            &[
                listing.clone(),
                buyer.clone(),
                collection.clone(),
                escrow_owner_peg.clone(),
                buyer_owner_peg.clone(),
                peg_record.clone(),
                buyer.clone(),
                system_program.clone(),
                cpeg_program.clone(),
            ],
            &[&[b"listing", collection.key.as_ref(), &peg_id.to_le_bytes(), &[bump]]],
        )?;
        invoke_signed(
            &token_transfer_with_hook(
                token_program.key,
                escrow_token.key,
                mint.key,
                buyer_token.key,
                listing.key,
                peg_unit,
                decimals,
                collection.key,
                escrow_owner_peg.key,
                buyer_owner_peg.key,
                hook_program.key,
                validation.key,
            )?,
            &[
                escrow_token.clone(),
                mint.clone(),
                buyer_token.clone(),
                listing.clone(),
                collection.clone(),
                escrow_owner_peg.clone(),
                buyer_owner_peg.clone(),
                hook_program.clone(),
                validation.clone(),
                token_program.clone(),
            ],
            &[&[b"listing", collection.key.as_ref(), &peg_id.to_le_bytes(), &[bump]]],
        )?;
        // Trade-art recording: every market fill atomically writes a TradeArtRecord to
        // mirror the Uniswap-v4 hook semantics ("every swap = one piece of art"). The
        // buyer signs the outer transaction so their signature propagates as both the
        // payer and the trader of the inner CPI. The clawpeg program's record_trade_art
        // is idempotent, so a pre-existing PDA (e.g. seeded manually by the curator)
        // gracefully no-ops without bricking the buy.
        //
        // We capture the price BEFORE closing the listing because close_account_into() zeroes
        // out the listing's data and the trade-art instruction needs the original sale amount.
        let sale_price_lamports = state.price_lamports;
        let trade_index = peg_id as u64;
        let (expected_trade_art, _trade_art_bump) = trade_art_address(cpeg_program.key, collection.key, trade_index);
        if expected_trade_art != *trade_art.key {
            solana_program::msg!("CpegMarketBuy: trade-art PDA mismatch");
            return Err(ProgramError::InvalidAccountData);
        }

        // Close the listing PDA so the same (collection, peg_id) pair can be re-listed in
        // the future. cPEG recycles per-fill state so each fill can be listed again later;
        // on Solana we replicate that semantic by transferring the listing's rent back to
        // the seller and resetting the PDA. After this point, any read of the listing
        // account will return an empty system-owned account.
        close_account_into(listing, seller)?;

        invoke(
            &cpeg_record_trade_art_instruction(
                cpeg_program.key,
                buyer.key,
                collection.key,
                trade_art.key,
                system_program.key,
                mint.key,
                trade_index,
                sale_price_lamports,
                peg_unit,
            ),
            &[
                buyer.clone(),
                buyer.clone(),
                collection.clone(),
                trade_art.clone(),
                system_program.clone(),
                mint.clone(),
                system_program.clone(),
                cpeg_program.clone(),
            ],
        )?;
        solana_program::msg!("CpegMarketSold");
        Ok(())
    }

    fn cancel(program_id: &Pubkey, accounts: &[AccountInfo], peg_id: u32) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let seller = next_account_info(account_info_iter)?;
        let collection = next_account_info(account_info_iter)?;
        let listing = next_account_info(account_info_iter)?;
        let escrow_owner_peg = next_account_info(account_info_iter)?;
        let seller_owner_peg = next_account_info(account_info_iter)?;
        let peg_record = next_account_info(account_info_iter)?;
        let escrow_token = next_account_info(account_info_iter)?;
        let seller_token = next_account_info(account_info_iter)?;
        let mint = next_account_info(account_info_iter)?;
        let cpeg_program = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        let hook_program = next_account_info(account_info_iter)?;
        let validation = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !seller.is_signer {
            solana_program::msg!("CpegMarketCancel: seller is not a signer");
            return Err(ProgramError::MissingRequiredSignature);
        }
        if listing.data_is_empty() {
            solana_program::msg!("CpegMarketCancel: listing PDA has no data");
            return Err(ProgramError::UninitializedAccount);
        }
        let state = MarketListing::unpack(&listing.try_borrow_data()?)?;
        let (peg_unit, decimals) = parse_cpeg_collection_config(&collection.try_borrow_data()?)?;
        let (expected_listing, bump) = listing_address(program_id, collection.key, peg_id);
        if expected_listing != *listing.key {
            solana_program::msg!("CpegMarketCancel: listing PDA mismatch");
            return Err(ProgramError::InvalidAccountData);
        }
        if state.status != STATUS_ACTIVE {
            solana_program::msg!("CpegMarketCancel: listing status is not ACTIVE ({})", state.status);
            return Err(ProgramError::InvalidAccountData);
        }
        if state.seller != *seller.key {
            solana_program::msg!("CpegMarketCancel: seller does not match listing.seller");
            return Err(ProgramError::InvalidAccountData);
        }
        invoke_signed(
            &cpeg_release_instruction(
                cpeg_program.key,
                listing.key,
                seller.key,
                collection.key,
                escrow_owner_peg.key,
                seller_owner_peg.key,
                peg_record.key,
                seller.key,
                system_program.key,
                peg_id,
            ),
            &[
                listing.clone(),
                seller.clone(),
                collection.clone(),
                escrow_owner_peg.clone(),
                seller_owner_peg.clone(),
                peg_record.clone(),
                seller.clone(),
                system_program.clone(),
                cpeg_program.clone(),
            ],
            &[&[b"listing", collection.key.as_ref(), &peg_id.to_le_bytes(), &[bump]]],
        )?;
        invoke_signed(
            &token_transfer_with_hook(
                token_program.key,
                escrow_token.key,
                mint.key,
                seller_token.key,
                listing.key,
                peg_unit,
                decimals,
                collection.key,
                escrow_owner_peg.key,
                seller_owner_peg.key,
                hook_program.key,
                validation.key,
            )?,
            &[
                escrow_token.clone(),
                mint.clone(),
                seller_token.clone(),
                listing.clone(),
                collection.clone(),
                escrow_owner_peg.clone(),
                seller_owner_peg.clone(),
                hook_program.clone(),
                validation.clone(),
                token_program.clone(),
            ],
            &[&[b"listing", collection.key.as_ref(), &peg_id.to_le_bytes(), &[bump]]],
        )?;
        // Close the listing PDA so the seller can re-list this peg later. Mirrors cPEG's
        // implicit per-swap state recycling: a cancelled listing should not leave a sticky
        // PDA at [b"listing", collection, peg_id] that blocks re-listing.
        close_account_into(listing, seller)?;
        solana_program::msg!("CpegMarketCancelled");
        Ok(())
    }
}

fn listing_address(program_id: &Pubkey, collection: &Pubkey, peg_id: u32) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"listing", collection.as_ref(), &peg_id.to_le_bytes()], program_id)
}

/// Close a program-owned account by draining its lamports into `recipient`, zeroing the
/// data, and reassigning ownership to the system program. Mirrors the canonical Solana
/// "close account" pattern. Used to make listing PDAs disposable so the same
/// (collection, peg_id) seed can be reused for re-listings.
fn close_account_into<'a>(
    account: &AccountInfo<'a>,
    recipient: &AccountInfo<'a>,
) -> ProgramResult {
    let lamports = account.lamports();
    if lamports == 0 {
        return Ok(());
    }
    {
        let mut account_lamports = account.try_borrow_mut_lamports()?;
        let mut recipient_lamports = recipient.try_borrow_mut_lamports()?;
        **recipient_lamports = recipient_lamports
            .checked_add(lamports)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        **account_lamports = 0;
    }
    account.realloc(0, false)?;
    account.assign(&solana_program::system_program::ID);
    Ok(())
}

struct CpegCollectionConfig {
    peg_unit: u64,
    decimals: u8,
    royalty_bps: u16,
    marketplace_fee_bps: u16,
    creator: Pubkey,
    fee_vault: Pubkey,
}

fn parse_cpeg_collection_config_full(data: &[u8]) -> Result<CpegCollectionConfig, ProgramError> {
    if data.len() < 228 || data[0] != 1 {
        return Err(ProgramError::InvalidAccountData);
    }
    let peg_unit = u64::from_le_bytes(
        data[131..139]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let royalty_bps = u16::from_le_bytes(
        data[159..161]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let marketplace_fee_bps = u16::from_le_bytes(
        data[161..163]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let creator = Pubkey::new_from_array(
        data[163..195]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let fee_vault = Pubkey::new_from_array(
        data[195..227]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let decimals = data[227];
    Ok(CpegCollectionConfig {
        peg_unit,
        decimals,
        royalty_bps,
        marketplace_fee_bps,
        creator,
        fee_vault,
    })
}

fn parse_cpeg_collection_config(data: &[u8]) -> Result<(u64, u8), ProgramError> {
    let cfg = parse_cpeg_collection_config_full(data)?;
    Ok((cfg.peg_unit, cfg.decimals))
}

fn split_payment(
    price: u64,
    royalty_bps: u16,
    marketplace_fee_bps: u16,
) -> Result<(u64, u64, u64), ProgramError> {
    let total_bps = (royalty_bps as u32) + (marketplace_fee_bps as u32);
    if total_bps > 10_000 {
        return Err(ProgramError::InvalidArgument);
    }
    let mul = |bps: u16| -> Result<u64, ProgramError> {
        let bps = bps as u128;
        let value = (price as u128).checked_mul(bps).ok_or(ProgramError::ArithmeticOverflow)?;
        Ok((value / 10_000u128) as u64)
    };
    let protocol_fee = mul(marketplace_fee_bps)?;
    let royalty = mul(royalty_bps)?;
    let seller_amount = price
        .checked_sub(protocol_fee)
        .and_then(|v| v.checked_sub(royalty))
        .ok_or(ProgramError::ArithmeticOverflow)?;
    Ok((seller_amount, royalty, protocol_fee))
}

fn create_pda_account<'a>(
    payer: &AccountInfo<'a>,
    new_account: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    owner: &Pubkey,
    size: usize,
    seeds: &[&[u8]],
) -> ProgramResult {
    let rent = Rent::get()?;
    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            new_account.key,
            rent.minimum_balance(size),
            size as u64,
            owner,
        ),
        &[payer.clone(), new_account.clone(), system_program.clone()],
        &[seeds],
    )
}

fn encode_peg_id(tag: u8, peg_id: u32) -> Vec<u8> {
    let mut data = vec![tag];
    data.extend_from_slice(&peg_id.to_le_bytes());
    data
}

#[allow(clippy::too_many_arguments)]
fn cpeg_lock_instruction(
    program_id: &Pubkey,
    seller: &Pubkey,
    collection: &Pubkey,
    escrow_owner: &Pubkey,
    seller_owner_peg: &Pubkey,
    escrow_owner_peg: &Pubkey,
    peg_record: &Pubkey,
    system_program: &Pubkey,
    peg_id: u32,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new(*seller, true),
            AccountMeta::new_readonly(*collection, false),
            AccountMeta::new_readonly(*escrow_owner, false),
            AccountMeta::new(*seller_owner_peg, false),
            AccountMeta::new(*escrow_owner_peg, false),
            AccountMeta::new(*peg_record, false),
            AccountMeta::new_readonly(*system_program, false),
        ],
        data: encode_peg_id(111, peg_id),
    }
}

#[allow(clippy::too_many_arguments)]
fn cpeg_release_instruction(
    program_id: &Pubkey,
    escrow_owner: &Pubkey,
    destination_owner: &Pubkey,
    collection: &Pubkey,
    escrow_owner_peg: &Pubkey,
    destination_owner_peg: &Pubkey,
    peg_record: &Pubkey,
    payer: &Pubkey,
    system_program: &Pubkey,
    peg_id: u32,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: vec![
            AccountMeta::new_readonly(*escrow_owner, true),
            AccountMeta::new_readonly(*destination_owner, false),
            AccountMeta::new_readonly(*collection, false),
            AccountMeta::new(*escrow_owner_peg, false),
            AccountMeta::new(*destination_owner_peg, false),
            AccountMeta::new(*peg_record, false),
            AccountMeta::new(*payer, true),
            AccountMeta::new_readonly(*system_program, false),
        ],
        data: encode_peg_id(112, peg_id),
    }
}

fn trade_art_address(program_id: &Pubkey, collection: &Pubkey, trade_index: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"trade-art", collection.as_ref(), &trade_index.to_le_bytes()],
        program_id,
    )
}

#[allow(clippy::too_many_arguments)]
fn cpeg_record_trade_art_instruction(
    program_id: &Pubkey,
    buyer: &Pubkey,
    collection: &Pubkey,
    trade_art: &Pubkey,
    input_mint: &Pubkey,
    output_mint: &Pubkey,
    trade_index: u64,
    amount_in: u64,
    amount_out: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(1 + 8 + 8 + 8);
    // RecordTradeArt opcode in the cpeg instruction set.
    data.push(107u8);
    data.extend_from_slice(&trade_index.to_le_bytes());
    data.extend_from_slice(&amount_in.to_le_bytes());
    data.extend_from_slice(&amount_out.to_le_bytes());
    Instruction {
        program_id: *program_id,
        accounts: vec![
            // payer (buyer pays rent)
            AccountMeta::new(*buyer, true),
            // trader (the wallet acquiring the cPEG)
            AccountMeta::new_readonly(*buyer, true),
            AccountMeta::new_readonly(*collection, false),
            AccountMeta::new(*trade_art, false),
            // input_mint slot reuses system_program key as the canonical "native SOL"
            // identifier in our protocol; record_trade_art only stores the key.
            AccountMeta::new_readonly(*input_mint, false),
            AccountMeta::new_readonly(*output_mint, false),
            AccountMeta::new_readonly(solana_program::system_program::ID, false),
        ],
        data,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_payment_zero_fees_keeps_full_amount_for_seller() {
        let (seller, royalty, protocol) = split_payment(1_000_000_000, 0, 0).unwrap();
        assert_eq!(seller, 1_000_000_000);
        assert_eq!(royalty, 0);
        assert_eq!(protocol, 0);
    }

    #[test]
    fn split_payment_basic_fees() {
        // 1 SOL price, 5% royalty, 2% protocol fee
        let (seller, royalty, protocol) = split_payment(1_000_000_000, 500, 200).unwrap();
        assert_eq!(royalty, 50_000_000);
        assert_eq!(protocol, 20_000_000);
        assert_eq!(seller, 930_000_000);
    }

    #[test]
    fn split_payment_rejects_overflow_bps() {
        let result = split_payment(1_000_000_000, 6000, 5000);
        assert!(result.is_err());
    }

    #[test]
    fn split_payment_handles_zero_price() {
        let (seller, royalty, protocol) = split_payment(0, 500, 200).unwrap();
        assert_eq!(seller, 0);
        assert_eq!(royalty, 0);
        assert_eq!(protocol, 0);
    }

    #[test]
    fn split_payment_handles_max_bps_boundary() {
        // 50% royalty, 50% protocol = 100% bps
        let (seller, royalty, protocol) = split_payment(1_000, 5000, 5000).unwrap();
        assert_eq!(seller, 0);
        assert_eq!(royalty, 500);
        assert_eq!(protocol, 500);
    }

    #[test]
    fn parse_collection_config_extracts_fields() {
        // Build a synthetic PegCollection-shaped byte buffer with known offsets.
        let mut data = vec![0u8; 228];
        data[0] = 1; // is_initialized
        data[131..139].copy_from_slice(&1_000_000_000u64.to_le_bytes()); // peg_unit
        data[159..161].copy_from_slice(&500u16.to_le_bytes()); // royalty
        data[161..163].copy_from_slice(&200u16.to_le_bytes()); // marketplace fee
        let creator_bytes = [7u8; 32];
        let fee_vault_bytes = [8u8; 32];
        data[163..195].copy_from_slice(&creator_bytes);
        data[195..227].copy_from_slice(&fee_vault_bytes);
        data[227] = 9; // decimals

        let cfg = parse_cpeg_collection_config_full(&data).expect("parse");
        assert_eq!(cfg.peg_unit, 1_000_000_000);
        assert_eq!(cfg.royalty_bps, 500);
        assert_eq!(cfg.marketplace_fee_bps, 200);
        assert_eq!(cfg.creator.as_ref(), &creator_bytes);
        assert_eq!(cfg.fee_vault.as_ref(), &fee_vault_bytes);
        assert_eq!(cfg.decimals, 9);
    }

    #[test]
    fn parse_collection_config_rejects_uninitialized() {
        let data = vec![0u8; 228];
        let result = parse_cpeg_collection_config_full(&data);
        assert!(result.is_err());
    }

    #[test]
    fn parse_collection_config_rejects_short_buffer() {
        let mut data = vec![0u8; 100];
        data[0] = 1;
        let result = parse_cpeg_collection_config_full(&data);
        assert!(result.is_err());
    }

    #[test]
    fn listing_pda_is_deterministic() {
        let program_id = Pubkey::new_unique();
        let collection = Pubkey::new_unique();
        let (a1, _) = listing_address(&program_id, &collection, 7);
        let (a2, _) = listing_address(&program_id, &collection, 7);
        let (a3, _) = listing_address(&program_id, &collection, 8);
        assert_eq!(a1, a2);
        assert_ne!(a1, a3);
    }

    #[test]
    fn trade_art_pda_is_deterministic_and_unique_per_peg_id() {
        let program_id = Pubkey::new_unique();
        let collection = Pubkey::new_unique();
        let (a1, _) = trade_art_address(&program_id, &collection, 7);
        let (a2, _) = trade_art_address(&program_id, &collection, 7);
        let (a3, _) = trade_art_address(&program_id, &collection, 8);
        assert_eq!(a1, a2, "same peg_id yields same trade-art PDA");
        assert_ne!(a1, a3, "different peg_id yields different trade-art PDA");
    }

    #[test]
    fn record_trade_art_instruction_encodes_record_trade_art_opcode() {
        let program_id = Pubkey::new_unique();
        let buyer = Pubkey::new_unique();
        let collection = Pubkey::new_unique();
        let trade_art = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let ix = cpeg_record_trade_art_instruction(
            &program_id,
            &buyer,
            &collection,
            &trade_art,
            &solana_program::system_program::ID,
            &mint,
            42,
            1_000_000_000,
            1_000_000,
        );
        // Opcode 107 = RecordTradeArt in the cpeg instruction set.
        assert_eq!(ix.data[0], 107);
        // 1 (opcode) + 8 (trade_index) + 8 (amount_in) + 8 (amount_out) = 25 bytes.
        assert_eq!(ix.data.len(), 25);
        // trade_index little-endian.
        let trade_index = u64::from_le_bytes(ix.data[1..9].try_into().unwrap());
        assert_eq!(trade_index, 42);
        let amount_in = u64::from_le_bytes(ix.data[9..17].try_into().unwrap());
        assert_eq!(amount_in, 1_000_000_000);
        let amount_out = u64::from_le_bytes(ix.data[17..25].try_into().unwrap());
        assert_eq!(amount_out, 1_000_000);
        // Account ordering matches clawpeg::record_trade_art expectations.
        assert_eq!(ix.accounts.len(), 7);
        assert!(ix.accounts[0].is_signer && ix.accounts[0].is_writable, "payer signer+writable");
        assert!(ix.accounts[1].is_signer, "trader signer");
        assert!(!ix.accounts[1].is_writable, "trader read-only");
        assert!(ix.accounts[3].is_writable, "trade_art writable for PDA init");
        assert_eq!(ix.accounts[6].pubkey, solana_program::system_program::ID);
    }
}

#[allow(clippy::too_many_arguments)]
fn token_transfer_with_hook(
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
) -> Result<Instruction, ProgramError> {
    let mut ix = token_instruction::transfer_checked(
        token_program,
        source_token,
        mint,
        destination_token,
        authority,
        &[],
        amount,
        decimals,
    )?;
    ix.accounts.push(AccountMeta::new_readonly(*collection, false));
    ix.accounts.push(AccountMeta::new(*source_owner_peg, false));
    ix.accounts.push(AccountMeta::new(*destination_owner_peg, false));
    ix.accounts.push(AccountMeta::new_readonly(*hook_program, false));
    ix.accounts.push(AccountMeta::new_readonly(*validation, false));
    Ok(ix)
}
