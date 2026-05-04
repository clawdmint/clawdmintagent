use solana_program::program_error::ProgramError;

#[repr(u32)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClawPegError {
    InvalidInstruction = 7000,
    InvalidAccount = 7001,
    InvalidAuthority = 7002,
    InvalidMint = 7003,
    InvalidOwner = 7004,
    InvalidCapacity = 7005,
    CollectionAlreadyInitialized = 7006,
    OwnerPegAlreadyInitialized = 7007,
    PegAlreadyInitialized = 7008,
    PegNotOwned = 7009,
    PegBurned = 7010,
    CapacityExceeded = 7011,
    SerializationError = 7012,
}

impl From<ClawPegError> for ProgramError {
    fn from(error: ClawPegError) -> Self {
        ProgramError::Custom(error as u32)
    }
}
