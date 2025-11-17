// src/utils/solana.js
import { Connection, PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();
const RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const commitment = "confirmed";
const connection = new Connection(RPC, commitment);

function lamportsFromSol(sol) {
  return Math.round(sol * 1_000_000_000);
}

function validPubkeyOrThrow(key) {
  try {
    return new PublicKey(key);
  } catch (err) {
    throw new Error("Invalid public key: " + key);
  }
}

export { connection, lamportsFromSol, validPubkeyOrThrow };
