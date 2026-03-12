use solana_program::program_error::ProgramError;

use crate::error::ClawdmintSolanaError;

#[derive(Debug, Clone)]
pub enum ClawdmintInstruction {
    InitializeCollection {
        collection_id: String,
        name: String,
        symbol: String,
        base_uri: String,
        max_supply: u32,
        mint_price_lamports: u64,
        royalty_bps: u16,
        payout_address: [u8; 32],
    },
    MintNft {
        quantity: u32,
    },
}

fn read_u16(data: &[u8], cursor: &mut usize) -> Result<u16, ProgramError> {
    if data.len() < *cursor + 2 {
      return Err(ClawdmintSolanaError::InvalidInstruction.into());
    }

    let value = u16::from_le_bytes([data[*cursor], data[*cursor + 1]]);
    *cursor += 2;
    Ok(value)
}

fn read_u32(data: &[u8], cursor: &mut usize) -> Result<u32, ProgramError> {
    if data.len() < *cursor + 4 {
      return Err(ClawdmintSolanaError::InvalidInstruction.into());
    }

    let value = u32::from_le_bytes([
        data[*cursor],
        data[*cursor + 1],
        data[*cursor + 2],
        data[*cursor + 3],
    ]);
    *cursor += 4;
    Ok(value)
}

fn read_u64(data: &[u8], cursor: &mut usize) -> Result<u64, ProgramError> {
    if data.len() < *cursor + 8 {
      return Err(ClawdmintSolanaError::InvalidInstruction.into());
    }

    let value = u64::from_le_bytes([
        data[*cursor],
        data[*cursor + 1],
        data[*cursor + 2],
        data[*cursor + 3],
        data[*cursor + 4],
        data[*cursor + 5],
        data[*cursor + 6],
        data[*cursor + 7],
    ]);
    *cursor += 8;
    Ok(value)
}

fn read_string(data: &[u8], cursor: &mut usize) -> Result<String, ProgramError> {
    let length = read_u16(data, cursor)? as usize;
    if data.len() < *cursor + length {
        return Err(ClawdmintSolanaError::InvalidInstruction.into());
    }

    let value = std::str::from_utf8(&data[*cursor..*cursor + length])
        .map_err(|_| ClawdmintSolanaError::InvalidInstruction)?;
    *cursor += length;
    Ok(value.to_string())
}

pub fn unpack(input: &[u8]) -> Result<ClawdmintInstruction, ProgramError> {
    let (&tag, rest) = input
        .split_first()
        .ok_or::<ProgramError>(ClawdmintSolanaError::InvalidInstruction.into())?;
    let mut cursor = 0usize;

    match tag {
        0 => {
            let collection_id = read_string(rest, &mut cursor)?;
            let name = read_string(rest, &mut cursor)?;
            let symbol = read_string(rest, &mut cursor)?;
            let base_uri = read_string(rest, &mut cursor)?;
            let max_supply = read_u32(rest, &mut cursor)?;
            let mint_price_lamports = read_u64(rest, &mut cursor)?;
            let royalty_bps = read_u16(rest, &mut cursor)?;

            if rest.len() < cursor + 32 {
                return Err(ClawdmintSolanaError::InvalidInstruction.into());
            }

            let mut payout_address = [0u8; 32];
            payout_address.copy_from_slice(&rest[cursor..cursor + 32]);

            Ok(ClawdmintInstruction::InitializeCollection {
                collection_id,
                name,
                symbol,
                base_uri,
                max_supply,
                mint_price_lamports,
                royalty_bps,
                payout_address,
            })
        }
        1 => Ok(ClawdmintInstruction::MintNft {
            quantity: read_u32(rest, &mut cursor)?,
        }),
        _ => Err(ClawdmintSolanaError::InvalidInstruction.into()),
    }
}

