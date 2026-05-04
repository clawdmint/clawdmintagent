use solana_program::program_error::ProgramError;
use spl_transfer_hook_interface::instruction::TransferHookInstruction;

use crate::cpeg_error::ClawPegError;

pub const CPEG_TAG_OFFSET: u8 = 100;

#[derive(Debug, Clone)]
pub enum ClawPegInstruction {
    InitializeCollection {
        renderer_hash: [u8; 32],
        collection_seed: [u8; 32],
        peg_unit: u64,
        max_pegs: u32,
        royalty_bps: u16,
        launch_fee_lamports: u64,
        marketplace_fee_bps: u16,
        flags: u8,
        decimals: u8,
    },
    InitializeOwnerPeg,
    SyncPeg,
    TransferPeg {
        peg_id: u32,
    },
    BurnPeg {
        peg_id: u32,
    },
    MintPeg {
        peg_id: u32,
    },
    RecordTradeArt {
        trade_index: u64,
        amount_in: u64,
        amount_out: u64,
    },
    ListPegEscrow {
        peg_id: u32,
        price_lamports: u64,
    },
    BuyPegEscrow {
        peg_id: u32,
    },
    CancelPegEscrow {
        peg_id: u32,
    },
    LockPegEscrow {
        peg_id: u32,
    },
    ReleasePegEscrow {
        peg_id: u32,
    },
    InitializeTransferHookAccounts {
        interface_order: bool,
    },
    ExecuteTransferHook {
        amount: u64,
    },
}

fn read_u8(data: &[u8], cursor: &mut usize) -> Result<u8, ProgramError> {
    if data.len() < *cursor + 1 {
        return Err(ClawPegError::InvalidInstruction.into());
    }
    let value = data[*cursor];
    *cursor += 1;
    Ok(value)
}

fn read_u16(data: &[u8], cursor: &mut usize) -> Result<u16, ProgramError> {
    if data.len() < *cursor + 2 {
        return Err(ClawPegError::InvalidInstruction.into());
    }
    let value = u16::from_le_bytes([data[*cursor], data[*cursor + 1]]);
    *cursor += 2;
    Ok(value)
}

fn read_u32(data: &[u8], cursor: &mut usize) -> Result<u32, ProgramError> {
    if data.len() < *cursor + 4 {
        return Err(ClawPegError::InvalidInstruction.into());
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
        return Err(ClawPegError::InvalidInstruction.into());
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

fn read_32(data: &[u8], cursor: &mut usize) -> Result<[u8; 32], ProgramError> {
    if data.len() < *cursor + 32 {
        return Err(ClawPegError::InvalidInstruction.into());
    }
    let mut value = [0u8; 32];
    value.copy_from_slice(&data[*cursor..*cursor + 32]);
    *cursor += 32;
    Ok(value)
}

pub fn unpack(input: &[u8]) -> Result<ClawPegInstruction, ProgramError> {
    if let Ok(hook_instruction) = TransferHookInstruction::unpack(input) {
        return match hook_instruction {
            TransferHookInstruction::Execute { amount } => {
                Ok(ClawPegInstruction::ExecuteTransferHook { amount })
            }
            TransferHookInstruction::InitializeExtraAccountMetaList { .. }
            | TransferHookInstruction::UpdateExtraAccountMetaList { .. } => {
                Ok(ClawPegInstruction::InitializeTransferHookAccounts {
                    interface_order: true,
                })
            }
        };
    }

    let (&tag, rest) = input
        .split_first()
        .ok_or::<ProgramError>(ClawPegError::InvalidInstruction.into())?;
    let mut cursor = 0usize;

    match tag {
        100 => Ok(ClawPegInstruction::InitializeCollection {
            renderer_hash: read_32(rest, &mut cursor)?,
            collection_seed: read_32(rest, &mut cursor)?,
            peg_unit: read_u64(rest, &mut cursor)?,
            max_pegs: read_u32(rest, &mut cursor)?,
            royalty_bps: read_u16(rest, &mut cursor)?,
            launch_fee_lamports: read_u64(rest, &mut cursor)?,
            marketplace_fee_bps: read_u16(rest, &mut cursor)?,
            flags: read_u8(rest, &mut cursor)?,
            decimals: if rest.len() > cursor {
                read_u8(rest, &mut cursor)?
            } else {
                0
            },
        }),
        101 => Ok(ClawPegInstruction::InitializeOwnerPeg),
        102 => Ok(ClawPegInstruction::SyncPeg),
        103 => Ok(ClawPegInstruction::TransferPeg {
            peg_id: read_u32(rest, &mut cursor)?,
        }),
        104 => Ok(ClawPegInstruction::BurnPeg {
            peg_id: read_u32(rest, &mut cursor)?,
        }),
        105 => Ok(ClawPegInstruction::InitializeTransferHookAccounts {
            interface_order: false,
        }),
        106 => Ok(ClawPegInstruction::MintPeg {
            peg_id: read_u32(rest, &mut cursor)?,
        }),
        107 => Ok(ClawPegInstruction::RecordTradeArt {
            trade_index: read_u64(rest, &mut cursor)?,
            amount_in: read_u64(rest, &mut cursor)?,
            amount_out: read_u64(rest, &mut cursor)?,
        }),
        108 => Ok(ClawPegInstruction::ListPegEscrow {
            peg_id: read_u32(rest, &mut cursor)?,
            price_lamports: read_u64(rest, &mut cursor)?,
        }),
        109 => Ok(ClawPegInstruction::BuyPegEscrow {
            peg_id: read_u32(rest, &mut cursor)?,
        }),
        110 => Ok(ClawPegInstruction::CancelPegEscrow {
            peg_id: read_u32(rest, &mut cursor)?,
        }),
        111 => Ok(ClawPegInstruction::LockPegEscrow {
            peg_id: read_u32(rest, &mut cursor)?,
        }),
        112 => Ok(ClawPegInstruction::ReleasePegEscrow {
            peg_id: read_u32(rest, &mut cursor)?,
        }),
        250 => Ok(ClawPegInstruction::ExecuteTransferHook {
            amount: read_u64(rest, &mut cursor)?,
        }),
        _ => {
            // Token-2022 transfer hook Execute instructions are interface encoded.
            // Until the SPL interface crate is wired into this workspace, accept the
            // common 8-byte discriminator + u64 amount shape as the hook path.
            if input.len() == 16 {
                let mut cursor = 8usize;
                return Ok(ClawPegInstruction::ExecuteTransferHook {
                    amount: read_u64(input, &mut cursor)?,
                });
            }
            Err(ClawPegError::InvalidInstruction.into())
        }
    }
}
