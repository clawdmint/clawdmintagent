use solana_program::program_error::ProgramError;

pub enum MarketInstruction {
    List { peg_id: u32, price_lamports: u64 },
    Buy { peg_id: u32 },
    Cancel { peg_id: u32 },
}

fn read_u32(data: &[u8], cursor: &mut usize) -> Result<u32, ProgramError> {
    if data.len() < *cursor + 4 {
        return Err(ProgramError::InvalidInstructionData);
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
        return Err(ProgramError::InvalidInstructionData);
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

pub fn unpack(input: &[u8]) -> Result<MarketInstruction, ProgramError> {
    let (&tag, rest) = input
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;
    let mut cursor = 0usize;
    match tag {
        0 => Ok(MarketInstruction::List {
            peg_id: read_u32(rest, &mut cursor)?,
            price_lamports: read_u64(rest, &mut cursor)?,
        }),
        1 => Ok(MarketInstruction::Buy {
            peg_id: read_u32(rest, &mut cursor)?,
        }),
        2 => Ok(MarketInstruction::Cancel {
            peg_id: read_u32(rest, &mut cursor)?,
        }),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
