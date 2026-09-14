pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("8ACN1KNEFXM2N2FMzxTfAzB1c3g5n47ZuhbPoUXPnCTp");

#[program]
pub mod agenttoll {
    use super::*;

    pub fn create_receipt(
        ctx: Context<CreateReceipt>,
        report_id: String,
        digest: [u8; 32],
    ) -> Result<()> {
        crate::instructions::create_receipt::handle_create_receipt(ctx, report_id, digest)
    }

    pub fn verify_receipt(
        ctx: Context<VerifyReceipt>,
        report_id: String,
        digest: [u8; 32],
    ) -> Result<()> {
        crate::instructions::verify_receipt::handle_verify_receipt(ctx, report_id, digest)
    }
}

#[event]
pub struct ReceiptCreated {
    pub vendor: Pubkey,
    pub report_id: String,
    pub digest: [u8; 32],
}

#[event]
pub struct ReceiptIdempotent {
    pub vendor: Pubkey,
    pub report_id: String,
    pub digest: [u8; 32],
}

#[event]
pub struct ReceiptVerified {
    pub verifier: Pubkey,
    pub report_id: String,
    pub digest: [u8; 32],
}
