use anchor_lang::prelude::*;

use crate::{constants::*, error::AgentTollError, state::Receipt};

#[derive(Accounts)]
#[instruction(report_id: String, digest: [u8; 32])]
pub struct CreateReceipt<'info> {
    #[account(mut)]
    pub vendor: Signer<'info>,
    #[account(
        init_if_needed,
        payer = vendor,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [RECEIPT_SEED, vendor.key().as_ref(), report_id.as_bytes()],
        bump
    )]
    pub receipt: Account<'info, Receipt>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_receipt(
    ctx: Context<CreateReceipt>,
    report_id: String,
    digest: [u8; 32],
) -> Result<()> {
    require!(!report_id.is_empty(), AgentTollError::ReportIdEmpty);
    require!(report_id.len() <= MAX_REPORT_ID_LEN, AgentTollError::ReportIdTooLong);

    let receipt = &mut ctx.accounts.receipt;
    if receipt.digest != [0u8; 32] {
        require!(receipt.vendor == ctx.accounts.vendor.key(), AgentTollError::DigestConflict);
        require!(receipt.digest == digest, AgentTollError::DigestConflict);
        emit!(crate::ReceiptIdempotent {
            vendor: ctx.accounts.vendor.key(),
            report_id,
            digest,
        });
        return Ok(());
    }

    receipt.vendor = ctx.accounts.vendor.key();
    receipt.report_id = report_id.clone();
    receipt.digest = digest;
    receipt.created_at = Clock::get()?.unix_timestamp;
    receipt.bump = ctx.bumps.receipt;
    emit!(crate::ReceiptCreated {
        vendor: receipt.vendor,
        report_id,
        digest,
    });
    Ok(())
}
