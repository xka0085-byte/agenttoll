use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_clock::Clock,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const LAMPORTS: u64 = 1_000_000_000;
const TEST_UNIX_TIMESTAMP: i64 = 1_700_000_000;

fn setup() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    let payer = Keypair::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/agenttoll.so"));
    svm.add_program(agenttoll::id(), bytes).unwrap();
    // litesvm 默认 Clock unix_timestamp = 0，程序会用它写 created_at，先设成真实量级
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = TEST_UNIX_TIMESTAMP;
    svm.set_sysvar::<Clock>(&clock);
    svm.airdrop(&payer.pubkey(), LAMPORTS).unwrap();
    (svm, payer)
}

fn receipt_address(vendor: &Pubkey, report_id: &str) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[agenttoll::constants::RECEIPT_SEED, vendor.as_ref(), report_id.as_bytes()],
        &agenttoll::id(),
    )
}

fn send_create(svm: &mut LiteSVM, vendor: &Keypair, report_id: &str, digest: [u8; 32])
    -> litesvm::types::TransactionResult
{
    let (receipt, _) = receipt_address(&vendor.pubkey(), report_id);
    let ix = Instruction::new_with_bytes(
        agenttoll::id(),
        &agenttoll::instruction::CreateReceipt {
            report_id: report_id.to_owned(),
            digest,
        }.data(),
        agenttoll::accounts::CreateReceipt {
            vendor: vendor.pubkey(),
            receipt,
            system_program: system_program::ID,
        }.to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&vendor.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[vendor]).unwrap();
    svm.send_transaction(tx)
}

fn send_verify(svm: &mut LiteSVM, verifier: &Keypair, vendor: &Pubkey, report_id: &str, digest: [u8; 32])
    -> litesvm::types::TransactionResult
{
    let (receipt, _) = receipt_address(vendor, report_id);
    let ix = Instruction::new_with_bytes(
        agenttoll::id(),
        &agenttoll::instruction::VerifyReceipt {
            report_id: report_id.to_owned(),
            digest,
        }.data(),
        agenttoll::accounts::VerifyReceipt {
            verifier: verifier.pubkey(),
            receipt,
        }.to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&verifier.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[verifier]).unwrap();
    svm.send_transaction(tx)
}

fn custom_error(result: litesvm::types::TransactionResult) -> u32 {
    let failed = result.unwrap_err();
    let text = format!("{:?}", failed.err);
    text.split("Custom(").nth(1).unwrap().split(')').next().unwrap().parse().unwrap()
}

#[test]
fn create_receipt_stores_fields_and_canonical_bump() {
    let (mut svm, vendor) = setup();
    let digest = [7u8; 32];
    assert!(send_create(&mut svm, &vendor, "report-1", digest).is_ok());
    let (address, bump) = receipt_address(&vendor.pubkey(), "report-1");
    let account = svm.get_account(&address).unwrap();
    let mut data: &[u8] = &account.data;
    let receipt = agenttoll::state::Receipt::try_deserialize(&mut data).unwrap();
    assert_eq!(receipt.vendor, vendor.pubkey());
    assert_eq!(receipt.report_id, "report-1");
    assert_eq!(receipt.digest, digest);
    assert!(receipt.created_at > 0);
    assert_eq!(receipt.bump, bump);
}

#[test]
fn duplicate_create_with_same_digest_is_idempotent() {
    let (mut svm, vendor) = setup();
    let digest = [8u8; 32];
    send_create(&mut svm, &vendor, "same", digest).unwrap();
    // 两笔交易字节相同会被 litesvm 判为重复（AlreadyProcessed），先推进 blockhash
    svm.expire_blockhash();
    let (address, _) = receipt_address(&vendor.pubkey(), "same");
    let before = svm.get_account(&address).unwrap().data;
    send_create(&mut svm, &vendor, "same", digest).unwrap();
    assert_eq!(svm.get_account(&address).unwrap().data, before);
}

#[test]
fn duplicate_create_with_different_digest_conflicts() {
    let (mut svm, vendor) = setup();
    send_create(&mut svm, &vendor, "conflict", [1u8; 32]).unwrap();
    assert_eq!(custom_error(send_create(&mut svm, &vendor, "conflict", [2u8; 32])), 6000);
}

#[test]
fn verify_matching_digest_succeeds() {
    let (mut svm, vendor) = setup();
    let verifier = Keypair::new();
    svm.airdrop(&verifier.pubkey(), LAMPORTS).unwrap();
    let digest = [3u8; 32];
    send_create(&mut svm, &vendor, "verify", digest).unwrap();
    assert!(send_verify(&mut svm, &verifier, &vendor.pubkey(), "verify", digest).is_ok());
}

#[test]
fn verify_mismatched_digest_fails() {
    let (mut svm, vendor) = setup();
    let verifier = Keypair::new();
    svm.airdrop(&verifier.pubkey(), LAMPORTS).unwrap();
    send_create(&mut svm, &vendor, "mismatch", [4u8; 32]).unwrap();
    assert_eq!(custom_error(send_verify(&mut svm, &verifier, &vendor.pubkey(), "mismatch", [5u8; 32])), 6001);
}

#[test]
fn empty_report_id_fails() {
    let (mut svm, vendor) = setup();
    assert_eq!(custom_error(send_create(&mut svm, &vendor, "", [0u8; 32])), 6003);
}

#[test]
fn report_id_of_exactly_32_bytes_succeeds() {
    let (mut svm, vendor) = setup();
    let digest = [11u8; 32];
    // 32 字节正好是 PDA 单 seed 上限，边界值必须成功；
    // >32 字节会被真实集群的 PDA 约束拒绝（MaxSeedLengthExceeded→ConstraintSeeds），
    // litesvm 的 syscall 实现遇到超限 seed 会 panic，无法在本地测试该路径
    let report_id = "x".repeat(32);
    assert!(send_create(&mut svm, &vendor, &report_id, digest).is_ok());
    let (address, _) = receipt_address(&vendor.pubkey(), &report_id);
    assert!(svm.get_account(&address).is_some());
}

#[test]
fn pda_derivation_matches_on_chain_account() {
    let (mut svm, vendor) = setup();
    send_create(&mut svm, &vendor, "pda", [9u8; 32]).unwrap();
    let (derived, bump) = Pubkey::find_program_address(
        &[b"receipt", vendor.pubkey().as_ref(), b"pda"],
        &agenttoll::id(),
    );
    let (expected, expected_bump) = receipt_address(&vendor.pubkey(), "pda");
    assert_eq!(derived, expected);
    assert_eq!(bump, expected_bump);
    assert!(svm.get_account(&derived).is_some());
}
