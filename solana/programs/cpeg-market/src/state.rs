use solana_program::{program_error::ProgramError, pubkey::Pubkey};

pub const MARKET_LISTING_SIZE: usize = 1 + 1 + 1 + 1 + 32 + 32 + 32 + 32 + 4 + 8 + 8;
pub const SALE_COUNTER_SIZE: usize = 1 + 1 + 32 + 8;
pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_FILLED: u8 = 2;
pub const STATUS_CANCELLED: u8 = 3;

pub struct MarketListing {
    pub is_initialized: bool,
    pub version: u8,
    pub bump: u8,
    pub status: u8,
    pub collection: Pubkey,
    pub seller: Pubkey,
    pub token_mint: Pubkey,
    pub escrow_token: Pubkey,
    pub peg_id: u32,
    pub price_lamports: u64,
    pub closed_slot: u64,
}

pub struct SaleCounter {
    pub is_initialized: bool,
    pub bump: u8,
    pub collection: Pubkey,
    pub count: u64,
}

fn read_pubkey(src: &[u8], cursor: &mut usize) -> Result<Pubkey, ProgramError> {
    if src.len() < *cursor + 32 {
        return Err(ProgramError::InvalidAccountData);
    }
    let key = Pubkey::new_from_array(
        src[*cursor..*cursor + 32]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    *cursor += 32;
    Ok(key)
}

fn read_u32(src: &[u8], cursor: &mut usize) -> Result<u32, ProgramError> {
    if src.len() < *cursor + 4 {
        return Err(ProgramError::InvalidAccountData);
    }
    let value = u32::from_le_bytes(
        src[*cursor..*cursor + 4]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    *cursor += 4;
    Ok(value)
}

fn read_u64(src: &[u8], cursor: &mut usize) -> Result<u64, ProgramError> {
    if src.len() < *cursor + 8 {
        return Err(ProgramError::InvalidAccountData);
    }
    let value = u64::from_le_bytes(
        src[*cursor..*cursor + 8]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    *cursor += 8;
    Ok(value)
}

impl MarketListing {
    pub fn pack(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        if dst.len() < MARKET_LISTING_SIZE {
            return Err(ProgramError::AccountDataTooSmall);
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
        dst[cursor..cursor + 32].copy_from_slice(self.token_mint.as_ref());
        cursor += 32;
        dst[cursor..cursor + 32].copy_from_slice(self.escrow_token.as_ref());
        cursor += 32;
        dst[cursor..cursor + 4].copy_from_slice(&self.peg_id.to_le_bytes());
        cursor += 4;
        dst[cursor..cursor + 8].copy_from_slice(&self.price_lamports.to_le_bytes());
        cursor += 8;
        dst[cursor..cursor + 8].copy_from_slice(&self.closed_slot.to_le_bytes());
        Ok(())
    }

    pub fn unpack(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() < MARKET_LISTING_SIZE {
            return Err(ProgramError::InvalidAccountData);
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
        let token_mint = read_pubkey(src, &mut cursor)?;
        let escrow_token = read_pubkey(src, &mut cursor)?;
        let peg_id = read_u32(src, &mut cursor)?;
        let price_lamports = read_u64(src, &mut cursor)?;
        let closed_slot = read_u64(src, &mut cursor)?;
        Ok(Self {
            is_initialized,
            version,
            bump,
            status,
            collection,
            seller,
            token_mint,
            escrow_token,
            peg_id,
            price_lamports,
            closed_slot,
        })
    }
}

impl SaleCounter {
    pub fn pack(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        if dst.len() < SALE_COUNTER_SIZE {
            return Err(ProgramError::AccountDataTooSmall);
        }
        let mut cursor = 0usize;
        dst[cursor] = self.is_initialized as u8;
        cursor += 1;
        dst[cursor] = self.bump;
        cursor += 1;
        dst[cursor..cursor + 32].copy_from_slice(self.collection.as_ref());
        cursor += 32;
        dst[cursor..cursor + 8].copy_from_slice(&self.count.to_le_bytes());
        Ok(())
    }

    pub fn unpack(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() < SALE_COUNTER_SIZE {
            return Err(ProgramError::InvalidAccountData);
        }
        let mut cursor = 0usize;
        let is_initialized = src[cursor] == 1;
        cursor += 1;
        let bump = src[cursor];
        cursor += 1;
        let collection = read_pubkey(src, &mut cursor)?;
        let count = read_u64(src, &mut cursor)?;
        Ok(Self {
            is_initialized,
            bump,
            collection,
            count,
        })
    }
}
