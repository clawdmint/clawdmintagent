use solana_program::{program_error::ProgramError, pubkey::Pubkey};

use crate::cpeg_error::ClawPegError;

pub const PEG_COLLECTION_SIZE: usize =
    1 + 1 + 1 + 32 + 32 + 32 + 32 + 8 + 4 + 4 + 4 + 8 + 2 + 2 + 32 + 32 + 1;
pub const OWNER_PEG_SIZE: usize = 1 + 1 + 32 + 32 + 4 + 4 + 4 + 8;
pub const PEG_RECORD_SIZE: usize = 1 + 1 + 32 + 32 + 4 + 32 + 8 + 8 + 8;
pub const TRADE_ART_RECORD_SIZE: usize = 1 + 1 + 1 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 32;
pub const MARKET_LISTING_SIZE: usize = 1 + 1 + 1 + 1 + 32 + 32 + 32 + 32 + 4 + 8 + 8 + 8;

pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_BURNED: u8 = 2;

pub const LISTING_STATUS_ACTIVE: u8 = 1;
pub const LISTING_STATUS_FILLED: u8 = 2;
pub const LISTING_STATUS_CANCELLED: u8 = 3;

#[derive(Clone, Debug, PartialEq)]
pub struct PegCollection {
    pub is_initialized: bool,
    pub version: u8,
    pub bump: u8,
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub renderer_hash: [u8; 32],
    pub collection_seed: [u8; 32],
    pub peg_unit: u64,
    pub max_pegs: u32,
    pub total_pegs: u32,
    pub burned_pegs: u32,
    pub launch_fee_lamports: u64,
    pub royalty_bps: u16,
    pub marketplace_fee_bps: u16,
    pub creator: Pubkey,
    pub fee_vault: Pubkey,
    pub decimals: u8,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OwnerPeg {
    pub is_initialized: bool,
    pub bump: u8,
    pub collection: Pubkey,
    pub owner: Pubkey,
    pub synced_capacity: u32,
    pub active_count: u32,
    pub generation: u32,
    pub last_synced_slot: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PegRecord {
    pub is_initialized: bool,
    pub status: u8,
    pub collection: Pubkey,
    pub owner: Pubkey,
    pub peg_id: u32,
    pub seed: [u8; 32],
    pub minted_slot: u64,
    pub transferred_slot: u64,
    pub burned_slot: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TradeArtRecord {
    pub is_initialized: bool,
    pub version: u8,
    pub bump: u8,
    pub collection: Pubkey,
    pub trader: Pubkey,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub trade_index: u64,
    pub amount_in: u64,
    pub amount_out: u64,
    pub slot: u64,
    pub seed: [u8; 32],
}

#[derive(Clone, Debug, PartialEq)]
pub struct MarketListing {
    pub is_initialized: bool,
    pub version: u8,
    pub bump: u8,
    pub status: u8,
    pub collection: Pubkey,
    pub seller: Pubkey,
    pub escrow_owner: Pubkey,
    pub token_mint: Pubkey,
    pub peg_id: u32,
    pub price_lamports: u64,
    pub created_slot: u64,
    pub closed_slot: u64,
}

fn read_pubkey(src: &[u8], cursor: &mut usize) -> Result<Pubkey, ProgramError> {
    if src.len() < *cursor + 32 {
        return Err(ClawPegError::SerializationError.into());
    }
    let key = Pubkey::new_from_array(
        src[*cursor..*cursor + 32]
            .try_into()
            .map_err(|_| ClawPegError::SerializationError)?,
    );
    *cursor += 32;
    Ok(key)
}

fn read_32(src: &[u8], cursor: &mut usize) -> Result<[u8; 32], ProgramError> {
    if src.len() < *cursor + 32 {
        return Err(ClawPegError::SerializationError.into());
    }
    let mut value = [0u8; 32];
    value.copy_from_slice(&src[*cursor..*cursor + 32]);
    *cursor += 32;
    Ok(value)
}

fn read_u32(src: &[u8], cursor: &mut usize) -> Result<u32, ProgramError> {
    if src.len() < *cursor + 4 {
        return Err(ClawPegError::SerializationError.into());
    }
    let value = u32::from_le_bytes(
        src[*cursor..*cursor + 4]
            .try_into()
            .map_err(|_| ClawPegError::SerializationError)?,
    );
    *cursor += 4;
    Ok(value)
}

fn read_u64(src: &[u8], cursor: &mut usize) -> Result<u64, ProgramError> {
    if src.len() < *cursor + 8 {
        return Err(ClawPegError::SerializationError.into());
    }
    let value = u64::from_le_bytes(
        src[*cursor..*cursor + 8]
            .try_into()
            .map_err(|_| ClawPegError::SerializationError)?,
    );
    *cursor += 8;
    Ok(value)
}

fn read_u16(src: &[u8], cursor: &mut usize) -> Result<u16, ProgramError> {
    if src.len() < *cursor + 2 {
        return Err(ClawPegError::SerializationError.into());
    }
    let value = u16::from_le_bytes(
        src[*cursor..*cursor + 2]
            .try_into()
            .map_err(|_| ClawPegError::SerializationError)?,
    );
    *cursor += 2;
    Ok(value)
}

impl PegCollection {
    pub fn pack(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        if dst.len() < PEG_COLLECTION_SIZE {
            return Err(ClawPegError::SerializationError.into());
        }
        let mut cursor = 0usize;
        dst[cursor] = self.is_initialized as u8;
        cursor += 1;
        dst[cursor] = self.version;
        cursor += 1;
        dst[cursor] = self.bump;
        cursor += 1;
        dst[cursor..cursor + 32].copy_from_slice(self.authority.as_ref());
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(self.token_mint.as_ref());
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(&self.renderer_hash);
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(&self.collection_seed);
        cursor += 32;
        dst[cursor..cursor + 8].copy_from_slice(&self.peg_unit.to_le_bytes());
        cursor += 8;
        dst[cursor..cursor + 4].copy_from_slice(&self.max_pegs.to_le_bytes());
        cursor += 4;
        dst[cursor..cursor + 4].copy_from_slice(&self.total_pegs.to_le_bytes());
        cursor += 4;
        dst[cursor..cursor + 4].copy_from_slice(&self.burned_pegs.to_le_bytes());
        cursor += 4;
        dst[cursor..cursor + 8].copy_from_slice(&self.launch_fee_lamports.to_le_bytes());
        cursor += 8;
        dst[cursor..cursor + 2].copy_from_slice(&self.royalty_bps.to_le_bytes());
        cursor += 2;
        dst[cursor..cursor + 2].copy_from_slice(&self.marketplace_fee_bps.to_le_bytes());
        cursor += 2;
        dst[cursor..cursor + 32].copy_from_slice(self.creator.as_ref());
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(self.fee_vault.as_ref());
        cursor += 32;
        dst[cursor] = self.decimals;
        Ok(())
    }

    pub fn unpack(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() < PEG_COLLECTION_SIZE {
            return Err(ClawPegError::SerializationError.into());
        }
        let mut cursor = 0usize;
        let is_initialized = src[cursor] == 1;
        cursor += 1;
        let version = src[cursor];
        cursor += 1;
        let bump = src[cursor];
        cursor += 1;
        let authority = read_pubkey(src, &mut cursor)?;
        let token_mint = read_pubkey(src, &mut cursor)?;
        let renderer_hash = read_32(src, &mut cursor)?;
        let collection_seed = read_32(src, &mut cursor)?;
        let peg_unit = read_u64(src, &mut cursor)?;
        let max_pegs = read_u32(src, &mut cursor)?;
        let total_pegs = read_u32(src, &mut cursor)?;
        let burned_pegs = read_u32(src, &mut cursor)?;
        let launch_fee_lamports = read_u64(src, &mut cursor)?;
        let royalty_bps = read_u16(src, &mut cursor)?;
        let marketplace_fee_bps = read_u16(src, &mut cursor)?;
        let creator = read_pubkey(src, &mut cursor)?;
        let fee_vault = read_pubkey(src, &mut cursor)?;
        let decimals = src.get(cursor).copied().unwrap_or(0);
        Ok(Self {
            is_initialized,
            version,
            bump,
            authority,
            token_mint,
            renderer_hash,
            collection_seed,
            peg_unit,
            max_pegs,
            total_pegs,
            burned_pegs,
            launch_fee_lamports,
            royalty_bps,
            marketplace_fee_bps,
            creator,
            fee_vault,
            decimals,
        })
    }
}

impl OwnerPeg {
    pub fn pack(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        if dst.len() < OWNER_PEG_SIZE {
            return Err(ClawPegError::SerializationError.into());
        }
        let mut cursor = 0usize;
        dst[cursor] = self.is_initialized as u8;
        cursor += 1;
        dst[cursor] = self.bump;
        cursor += 1;
        dst[cursor..cursor + 32].copy_from_slice(self.collection.as_ref());
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(self.owner.as_ref());
        cursor += 32;
        dst[cursor..cursor + 4].copy_from_slice(&self.synced_capacity.to_le_bytes());
        cursor += 4;
        dst[cursor..cursor + 4].copy_from_slice(&self.active_count.to_le_bytes());
        cursor += 4;
        dst[cursor..cursor + 4].copy_from_slice(&self.generation.to_le_bytes());
        cursor += 4;
        dst[cursor..cursor + 8].copy_from_slice(&self.last_synced_slot.to_le_bytes());
        Ok(())
    }

    pub fn unpack(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() < OWNER_PEG_SIZE {
            return Err(ClawPegError::SerializationError.into());
        }
        let mut cursor = 0usize;
        let is_initialized = src[cursor] == 1;
        cursor += 1;
        let bump = src[cursor];
        cursor += 1;
        let collection = read_pubkey(src, &mut cursor)?;
        let owner = read_pubkey(src, &mut cursor)?;
        let synced_capacity = read_u32(src, &mut cursor)?;
        let active_count = read_u32(src, &mut cursor)?;
        let generation = read_u32(src, &mut cursor)?;
        let last_synced_slot = read_u64(src, &mut cursor)?;
        Ok(Self {
            is_initialized,
            bump,
            collection,
            owner,
            synced_capacity,
            active_count,
            generation,
            last_synced_slot,
        })
    }
}

impl TradeArtRecord {
    pub fn pack(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        if dst.len() < TRADE_ART_RECORD_SIZE {
            return Err(ClawPegError::SerializationError.into());
        }
        let mut cursor = 0usize;
        dst[cursor] = self.is_initialized as u8;
        cursor += 1;
        dst[cursor] = self.version;
        cursor += 1;
        dst[cursor] = self.bump;
        cursor += 1;
        dst[cursor..cursor + 32].copy_from_slice(self.collection.as_ref());
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(self.trader.as_ref());
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(self.input_mint.as_ref());
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(self.output_mint.as_ref());
        cursor += 32;
        dst[cursor..cursor + 8].copy_from_slice(&self.trade_index.to_le_bytes());
        cursor += 8;
        dst[cursor..cursor + 8].copy_from_slice(&self.amount_in.to_le_bytes());
        cursor += 8;
        dst[cursor..cursor + 8].copy_from_slice(&self.amount_out.to_le_bytes());
        cursor += 8;
        dst[cursor..cursor + 8].copy_from_slice(&self.slot.to_le_bytes());
        cursor += 8;
        dst[cursor..cursor + 32].copy_from_slice(&self.seed);
        Ok(())
    }

    pub fn unpack(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() < TRADE_ART_RECORD_SIZE {
            return Err(ClawPegError::SerializationError.into());
        }
        let mut cursor = 0usize;
        let is_initialized = src[cursor] == 1;
        cursor += 1;
        let version = src[cursor];
        cursor += 1;
        let bump = src[cursor];
        cursor += 1;
        let collection = read_pubkey(src, &mut cursor)?;
        let trader = read_pubkey(src, &mut cursor)?;
        let input_mint = read_pubkey(src, &mut cursor)?;
        let output_mint = read_pubkey(src, &mut cursor)?;
        let trade_index = read_u64(src, &mut cursor)?;
        let amount_in = read_u64(src, &mut cursor)?;
        let amount_out = read_u64(src, &mut cursor)?;
        let slot = read_u64(src, &mut cursor)?;
        let seed = read_32(src, &mut cursor)?;
        Ok(Self {
            is_initialized,
            version,
            bump,
            collection,
            trader,
            input_mint,
            output_mint,
            trade_index,
            amount_in,
            amount_out,
            slot,
            seed,
        })
    }
}

impl MarketListing {
    pub fn pack(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        if dst.len() < MARKET_LISTING_SIZE {
            return Err(ClawPegError::SerializationError.into());
        }
        let mut cursor = 0usize;
        dst[cursor] = self.is_initialized as u8;
        cursor += 1;
        dst[cursor] = self.version;
        cursor += 1;
        dst[cursor] = self.bump;
        cursor += 1;
        dst[cursor] = self.status;
        cursor += 1;
        dst[cursor..cursor + 32].copy_from_slice(self.collection.as_ref());
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(self.seller.as_ref());
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(self.escrow_owner.as_ref());
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(self.token_mint.as_ref());
        cursor += 32;
        dst[cursor..cursor + 4].copy_from_slice(&self.peg_id.to_le_bytes());
        cursor += 4;
        dst[cursor..cursor + 8].copy_from_slice(&self.price_lamports.to_le_bytes());
        cursor += 8;
        dst[cursor..cursor + 8].copy_from_slice(&self.created_slot.to_le_bytes());
        cursor += 8;
        dst[cursor..cursor + 8].copy_from_slice(&self.closed_slot.to_le_bytes());
        Ok(())
    }

    pub fn unpack(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() < MARKET_LISTING_SIZE {
            return Err(ClawPegError::SerializationError.into());
        }
        let mut cursor = 0usize;
        let is_initialized = src[cursor] == 1;
        cursor += 1;
        let version = src[cursor];
        cursor += 1;
        let bump = src[cursor];
        cursor += 1;
        let status = src[cursor];
        cursor += 1;
        let collection = read_pubkey(src, &mut cursor)?;
        let seller = read_pubkey(src, &mut cursor)?;
        let escrow_owner = read_pubkey(src, &mut cursor)?;
        let token_mint = read_pubkey(src, &mut cursor)?;
        let peg_id = read_u32(src, &mut cursor)?;
        let price_lamports = read_u64(src, &mut cursor)?;
        let created_slot = read_u64(src, &mut cursor)?;
        let closed_slot = read_u64(src, &mut cursor)?;
        Ok(Self {
            is_initialized,
            version,
            bump,
            status,
            collection,
            seller,
            escrow_owner,
            token_mint,
            peg_id,
            price_lamports,
            created_slot,
            closed_slot,
        })
    }
}

impl PegRecord {
    pub fn pack(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        if dst.len() < PEG_RECORD_SIZE {
            return Err(ClawPegError::SerializationError.into());
        }
        let mut cursor = 0usize;
        dst[cursor] = self.is_initialized as u8;
        cursor += 1;
        dst[cursor] = self.status;
        cursor += 1;
        dst[cursor..cursor + 32].copy_from_slice(self.collection.as_ref());
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(self.owner.as_ref());
        cursor += 32;
        dst[cursor..cursor + 4].copy_from_slice(&self.peg_id.to_le_bytes());
        cursor += 4;
        dst[cursor..cursor + 32].copy_from_slice(&self.seed);
        cursor += 32;
        dst[cursor..cursor + 8].copy_from_slice(&self.minted_slot.to_le_bytes());
        cursor += 8;
        dst[cursor..cursor + 8].copy_from_slice(&self.transferred_slot.to_le_bytes());
        cursor += 8;
        dst[cursor..cursor + 8].copy_from_slice(&self.burned_slot.to_le_bytes());
        Ok(())
    }

    pub fn unpack(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() < PEG_RECORD_SIZE {
            return Err(ClawPegError::SerializationError.into());
        }
        let mut cursor = 0usize;
        let is_initialized = src[cursor] == 1;
        cursor += 1;
        let status = src[cursor];
        cursor += 1;
        let collection = read_pubkey(src, &mut cursor)?;
        let owner = read_pubkey(src, &mut cursor)?;
        let peg_id = read_u32(src, &mut cursor)?;
        let seed = read_32(src, &mut cursor)?;
        let minted_slot = read_u64(src, &mut cursor)?;
        let transferred_slot = read_u64(src, &mut cursor)?;
        let burned_slot = read_u64(src, &mut cursor)?;
        Ok(Self {
            is_initialized,
            status,
            collection,
            owner,
            peg_id,
            seed,
            minted_slot,
            transferred_slot,
            burned_slot,
        })
    }
}
