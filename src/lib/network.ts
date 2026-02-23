export enum Network {
  BASE_SEPOLIA = "base-sepolia",
  BASE = "base-mainnet",
  POLYGON_MAINNET = "polygon-mainnet",
}

export const getNetworkUrl = () => {
  const network = process.env.BLOCKCHAIN_NETWORK;
  const apiKey = process.env.ALCHEMY_API_KEY;
  return `https://${network}.g.alchemy.com/v2/${apiKey}`;
};

export const getChainId = () => {
  switch (process.env.BLOCKCHAIN_NETWORK) {
    case Network.BASE_SEPOLIA:
      return 84532;
    case Network.BASE:
      return 8453;
    case Network.POLYGON_MAINNET:
      return 137;
  }
};

export const getNetworkToken = () => {
  switch (process.env.BLOCKCHAIN_NETWORK) {
    case Network.BASE:
    case Network.BASE_SEPOLIA:
      return "ETH";
    case Network.POLYGON_MAINNET:
      return "MATIC";
  }
};

export const getFaucetUrl = () => {
  switch (process.env.BLOCKCHAIN_NETWORK) {
    case Network.BASE_SEPOLIA:
      return "https://www.alchemy.com/faucets/base-sepolia";
    case Network.POLYGON_MAINNET:
      return "https://faucet.polygon.technology/";
  }
};

export const getNetworkName = () => {
  switch (process.env.BLOCKCHAIN_NETWORK) {
    case Network.BASE_SEPOLIA:
      return "Base (Sepolia)";
    case Network.BASE:
      return "Base (Mainnet)";
    case Network.POLYGON_MAINNET:
      return "Polygon (Mainnet)";
  }
};

export const getBlockExplorer = () => {
  switch (process.env.BLOCKCHAIN_NETWORK) {
    case Network.BASE:
      return `https://basescan.org`;
    case Network.BASE_SEPOLIA:
      return `https://sepolia.basescan.org`;
    case Network.POLYGON_MAINNET:
      return `https://polygonscan.com`;
  }
};

export const isEip1559Supported = () => {
  switch (process.env.BLOCKCHAIN_NETWORK) {
    case Network.BASE_SEPOLIA:
    case Network.BASE:
      return true;
    case Network.POLYGON_MAINNET:
      return true;
  }
};
