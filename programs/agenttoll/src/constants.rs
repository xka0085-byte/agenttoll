use anchor_lang::prelude::*;

#[constant]
pub const RECEIPT_SEED: &[u8] = b"receipt";

// PDA 单个 seed 上限 32 字节（Solana find_program_address 约束），
// report_id 直接作为 seed，因此不得超过 32 字节。
pub const MAX_REPORT_ID_LEN: usize = 32;
