use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub vendor: Pubkey,
    #[max_len(64)]
    pub report_id: String,
    pub digest: [u8; 32],
    pub created_at: i64,
    pub bump: u8,
}
