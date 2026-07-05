"use client";

/**
 * lib/useWallet.ts
 * Connects to MetaMask, verifies it's on the correct GenLayer network,
 * and offers to add/switch to it if not. GenLayer accepts address-only —
 * MetaMask handles signing of txs.
 *
 * AUDIT FIX (production hardening pass): previously this hook connected to
 * whatever network MetaMask happened to be on with zero verification. A
 * user sitting on Ethereum Mainnet or any other chain would have their
 * transactions silently misrouted or fail with a confusing raw RPC error.
 * Chain IDs and RPC URLs below are taken directly from the live GenLayer
 * docs (/developers/networks).
 */

import { useState, useEffect, useCallback } from "react";

type EthereumRequestArgs = {
  method: string;
  params?: readonly unknown[];
};

type EthereumProviderError = {
  code?: number;
  message?: string;
};

type EthereumEventHandler = (...args: unknown[]) => void;

declare global {
  interface Window {
    ethereum?: {
      request: (args: EthereumRequestArgs) => Promise<unknown>;
      on: (event: string, handler: EthereumEventHandler) => void;
      removeListener: (event: string, handler: EthereumEventHandler) => void;
      isMetaMask?: boolean;
    };
  }
}

function providerError(err: unknown): EthereumProviderError {
  return typeof err === "object" && err !== null ? err : {};
}

// GenLayer network definitions — chain IDs and RPCs per /developers/networks
export const GENLAYER_NETWORKS: Record<
  string,
  {
    chainIdHex: string;
    chainIdDecimal: number;
    chainName: string;
    rpcUrl: string;
    explorerUrl: string;
  }
> = {
  "testnet-bradbury": {
    chainIdHex: "0x107d", // 4221
    chainIdDecimal: 4221,
    chainName: "GenLayer Testnet Bradbury",
    rpcUrl: "https://rpc-bradbury.genlayer.com",
    explorerUrl: "https://explorer-bradbury.genlayer.com",
  },
  "testnet-asimov": {
    chainIdHex: "0x107d", // 4221 — shares chain ID with Bradbury per docs
    chainIdDecimal: 4221,
    chainName: "GenLayer Testnet Asimov",
    rpcUrl: "https://rpc-asimov.genlayer.com",
    explorerUrl: "https://explorer-asimov.genlayer.com",
  },
  studionet: {
    chainIdHex: "0xf22f", // 61999
    chainIdDecimal: 61999,
    chainName: "GenLayer Studionet",
    rpcUrl: "https://studio.genlayer.com/api",
    explorerUrl: "https://genlayer-explorer.vercel.app",
  },
  localnet: {
    chainIdHex: "0xeec7", // 61127
    chainIdDecimal: 61127,
    chainName: "GenLayer Localnet",
    rpcUrl: "http://localhost:4000/api",
    explorerUrl: "http://localhost:8080",
  },
};

const ACTIVE_NETWORK_KEY =
  process.env.NEXT_PUBLIC_GENLAYER_NETWORK || "testnet-bradbury";
const ACTIVE_NETWORK =
  GENLAYER_NETWORKS[ACTIVE_NETWORK_KEY] ?? GENLAYER_NETWORKS["testnet-bradbury"];

export interface WalletState {
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  /** True once we've confirmed MetaMask is on the configured GenLayer chain */
  isCorrectNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Prompts MetaMask to add/switch to the configured GenLayer network */
  switchNetwork: () => Promise<void>;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);

  const checkNetwork = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    try {
      const chainId = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
      setIsCorrectNetwork(
        chainId.toLowerCase() === ACTIVE_NETWORK.chainIdHex.toLowerCase()
      );
    } catch {
      setIsCorrectNetwork(false);
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("MetaMask not found.");
      return;
    }
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ACTIVE_NETWORK.chainIdHex }],
      });
      await checkNetwork();
    } catch (switchErr: unknown) {
      const err = providerError(switchErr);
      // 4902 = chain not added to MetaMask yet — add it
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: ACTIVE_NETWORK.chainIdHex,
                chainName: ACTIVE_NETWORK.chainName,
                rpcUrls: [ACTIVE_NETWORK.rpcUrl],
                nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
                blockExplorerUrls: [ACTIVE_NETWORK.explorerUrl],
              },
            ],
          });
          await checkNetwork();
        } catch (addErr: unknown) {
          setError(
            providerError(addErr).message || "Failed to add GenLayer network."
          );
        }
      } else if (err.code === 4001) {
        setError("Network switch rejected.");
      } else {
        setError(err.message || "Failed to switch network.");
      }
    }
  }, [checkNetwork]);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("MetaMask not found. Please install the browser extension.");
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (accounts[0]) {
        setAddress(accounts[0]);
        await checkNetwork();
      } else {
        setError("No account returned by MetaMask.");
      }
    } catch (e: unknown) {
      const err = providerError(e);
      if (err.code === 4001) {
        setError("Connection request rejected.");
      } else {
        setError(err.message || "Failed to connect wallet");
      }
    } finally {
      setIsConnecting(false);
    }
  }, [checkNetwork]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setIsCorrectNetwork(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    window.ethereum
      .request({ method: "eth_accounts" })
      .then(async (accounts) => {
        const accountList = accounts as string[];
        if (accountList[0]) {
          setAddress(accountList[0]);
          await checkNetwork();
        }
      })
      .catch(() => {
        /* silent — user simply isn't connected yet */
      });

    const handleAccountsChanged: EthereumEventHandler = (accounts) => {
      const accountList = accounts as string[];
      setAddress(accountList[0] || null);
    };
    const handleChainChanged: EthereumEventHandler = () => {
      checkNetwork();
    };
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [checkNetwork]);

  return {
    address,
    isConnecting,
    error,
    isCorrectNetwork,
    connect,
    disconnect,
    switchNetwork,
  };
}
