use solana_program::{
    program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::error::ClawdmintSolanaError;

pub const COLLECTION_ACCOUNT_SIZE: usize = 8 + 4 + 128 + 4 + 16 + 4 + 256 + 4 + 4 + 8 + 2 + 32 + 32 + 8;

#[derive(Clone, Debug, PartialEq)]
pub struct CollectionAccount {
    pub is_initialized: bool,
    pub authority: Pubkey,
    pub payout_address: Pubkey,
    pub collection_id: String,
    pub name: String,
    pub symbol: String,
    pub base_uri: String,
    pub max_supply: u32,
    pub total_minted: u32,
    pub mint_price_lamports: u64,
    pub royalty_bps: u16,
}

fn write_string(target: &mut Vec<u8>, value: &str) {
    let bytes = value.as_bytes();
    target.extend_from_slice(&(bytes.len() as u16).to_le_bytes());
    target.extend_from_slice(bytes);
}

fn read_string(data: &[u8], cursor: &mut usize) -> Result<String, ProgramError> {
    if data.len() < *cursor + 2 {
        return Err(ClawdmintSolanaError::SerializationError.into());
    }

    let length = u16::from_le_bytes([data[*cursor], data[*cursor + 1]]) as usize;
    *cursor += 2;
    if data.len() < *cursor + length {
        return Err(ClawdmintSolanaError::SerializationError.into());
    }

    let value = std::str::from_utf8(&data[*cursor..*cursor + length])
        .map_err(|_| ClawdmintSolanaError::SerializationError)?;
    *cursor += length;
    Ok(value.to_string())
}

impl CollectionAccount {
    pub fn pack(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        let mut data = Vec::with_capacity(dst.len());
        data.push(self.is_initialized as u8);
        data.extend_from_slice(self.authority.as_ref());
        data.extend_from_slice(self.payout_address.as_ref());
        write_string(&mut data, &self.collection_id);
        write_string(&mut data, &self.name);
        write_string(&mut data, &self.symbol);
        write_string(&mut data, &self.base_uri);
        data.extend_from_slice(&self.max_supply.to_le_bytes());
        data.extend_from_slice(&self.total_minted.to_le_bytes());
        data.extend_from_slice(&self.mint_price_lamports.to_le_bytes());
        data.extend_from_slice(&self.royalty_bps.to_le_bytes());

        if data.len() > dst.len() {
            return Err(ClawdmintSolanaError::SerializationError.into());
        }

        dst.fill(0);
        dst[..data.len()].copy_from_slice(&data);
        Ok(())
    }

    pub fn unpack(src: &[u8]) -> Result<Self, ProgramError> {
        if src.is_empty() {
            return Err(ClawdmintSolanaError::SerializationError.into());
        }

        let mut cursor = 1usize;
        if src.len() < cursor + 64 {
            return Err(ClawdmintSolanaError::SerializationError.into());
        }

        let authority = Pubkey::new_from_array(
            src[cursor..cursor + 32]
                .try_into()
                .map_err(|_| ClawdmintSolanaError::SerializationError)?,
        );
        cursor += 32;
        let payout_address = Pubkey::new_from_array(
            src[cursor..cursor + 32]
                .try_into()
                .map_err(|_| ClawdmintSolanaError::SerializationError)?,
        );
        cursor += 32;

        let collection_id = read_string(src, &mut cursor)?;
        let name = read_string(src, &mut cursor)?;
        let symbol = read_string(src, &mut cursor)?;
        let base_uri = read_string(src, &mut cursor)?;

        if src.len() < cursor + 18 {
            return Err(ClawdmintSolanaError::SerializationError.into());
        }

        let max_supply = u32::from_le_bytes(
            src[cursor..cursor + 4]
                .try_into()
                .map_err(|_| ClawdmintSolanaError::SerializationError)?,
        );
        cursor += 4;
        let total_minted = u32::from_le_bytes(
            src[cursor..cursor + 4]
                .try_into()
                .map_err(|_| ClawdmintSolanaError::SerializationError)?,
        );
        cursor += 4;
        let mint_price_lamports = u64::from_le_bytes(
            src[cursor..cursor + 8]
                .try_into()
                .map_err(|_| ClawdmintSolanaError::SerializationError)?,
        );
        cursor += 8;
        let royalty_bps = u16::from_le_bytes(
            src[cursor..cursor + 2]
                .try_into()
                .map_err(|_| ClawdmintSolanaError::SerializationError)?,
        );

        Ok(Self {
            is_initialized: src[0] == 1,
            authority,
            payout_address,
            collection_id,
            name,
            symbol,
            base_uri,
            max_supply,
            total_minted,
            mint_price_lamports,
            royalty_bps,
        })
    }
}

