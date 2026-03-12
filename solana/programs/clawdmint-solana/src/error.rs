use solana_program::program_error::ProgramError;

#[repr(u32)]
pub enum ClawdmintSolanaError {
    InvalidInstruction = 6000,
    CollectionAlreadyInitialized = 6001,
    InvalidCollectionAccount = 6002,
    InvalidAuthority = 6003,
    SoldOut = 6004,
    InvalidQuantity = 6005,
    SerializationError = 6006,
}

impl From<ClawdmintSolanaError> for ProgramError {
    fn from(error: ClawdmintSolanaError) -> Self {
        ProgramError::Custom(error as u32)
    }
}

