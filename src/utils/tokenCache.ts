import type { TokenCache } from '../types';

export const tokenCache: TokenCache = {
  "So11111111111111111111111111111111111111112": "SOL",
  "5uErKfXnzt3aHQyWf9ST4LotEN4oUdNrgQbHPERq3h8X": "MM", // Example Meme Moguls token
  "8c9yqAKmuDXNyLXvdKsdq4AdBxeD6KZKhRm1rXBLpump": "MM", // Added from sample transaction
  // Add other frequently traded token mints and their symbols here
};

// In-memory cache for fetched token metadata
const fetchedTokenCache: TokenCache = {};

// Token metadata interface for Jupiter API response
interface TokenMetadata {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

// Function to fetch token metadata from Jupiter API
export async function fetchTokenMetadata(mintAddress: string): Promise<string> {
  // Check hardcoded cache first
  if (tokenCache[mintAddress]) {
    return tokenCache[mintAddress];
  }
  
  // Check in-memory fetched cache
  if (fetchedTokenCache[mintAddress]) {
    return fetchedTokenCache[mintAddress];
  }
  
  try {
    // Try Jupiter token list API first
    const jupiterResponse = await fetch(`https://token.jup.ag/strict`, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(3000)
    });
    
    if (jupiterResponse.ok) {
      const tokens: TokenMetadata[] = await jupiterResponse.json();
      const token = tokens.find(t => t.address === mintAddress);
      
      if (token && token.symbol) {
        fetchedTokenCache[mintAddress] = token.symbol;
        return token.symbol;
      }
    }
  } catch (error) {
    console.warn(`Failed to fetch token metadata from Jupiter for ${mintAddress}:`, error);
  }
  
  try {
    // Fallback: Try Solana token registry
    const registryResponse = await fetch(`https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json`, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(3000)
    });
    
    if (registryResponse.ok) {
      const tokenList = await registryResponse.json();
      const token = tokenList.tokens?.find((t: TokenMetadata) => t.address === mintAddress);
      
      if (token && token.symbol) {
        fetchedTokenCache[mintAddress] = token.symbol;
        return token.symbol;
      }
    }
  } catch (error) {
    console.warn(`Failed to fetch token metadata from Solana registry for ${mintAddress}:`, error);
  }
  
  // If all else fails, return truncated mint address
  const truncatedMint = `${mintAddress.substring(0, 6)}...${mintAddress.substring(mintAddress.length - 4)}`;
  fetchedTokenCache[mintAddress] = truncatedMint;
  return truncatedMint;
}

// Function to get token symbol (synchronous, returns cached or truncated mint)
export function getTokenSymbol(mintAddress: string): string {
  return tokenCache[mintAddress] || fetchedTokenCache[mintAddress] || `${mintAddress.substring(0, 6)}...${mintAddress.substring(mintAddress.length - 4)}`;
}

// Function to preload token metadata (call this in background)
export async function preloadTokenMetadata(mintAddresses: string[]): Promise<void> {
  const promises = mintAddresses
    .filter(mint => !tokenCache[mint] && !fetchedTokenCache[mint])
    .map(mint => fetchTokenMetadata(mint).catch(() => null));
  
  await Promise.allSettled(promises);
} 