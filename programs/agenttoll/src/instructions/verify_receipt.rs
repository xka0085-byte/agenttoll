use anchor_lang::prelude::*;

use crate::{constants::RECEIPT_SEED, error::AgentTollError, state::Receipt};

#[derive(Accounts)]
#[instruction(report_id: String, digest: [u8; 32])]
pub struct VerifyReceipt<'info> {
    pub verifier: Signer<'info>,
    #[account(
        seeds = [RECEIPT_SEED, receipt.vendor.as_ref(), report_id.as_bytes()],
        bump = receipt.bump
    )]
    pub receipt: Account<'info, Receipt>,
}

pub fn handle_verify_receipt(
    ctx: Context<VerifyReceipt>,
    report_id: String,
    digest: [u8; 32],
) -> Result<()> {
    require!(ctx.accounts.receipt.report_id == report_id, AgentTollError::DigestMismatch);
    require!(ctx.accounts.receipt.digest == digest, AgentTollError::DigestMismatch);
    emit!(crate::ReceiptVerified {
        verifier: ctx.accounts.verifier.key(),
        report_id,
        digest,
    });
    Ok(())
}
