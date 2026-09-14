use anchor_lang::prelude::*;

#[error_code]
pub enum AgentTollError {
    #[msg("Receipt already exists with a different digest")]
    DigestConflict,
    #[msg("Receipt digest does not match")]
    DigestMismatch,
    #[msg("Report ID is too long")]
    ReportIdTooLong,
    #[msg("Report ID cannot be empty")]
    ReportIdEmpty,
}
