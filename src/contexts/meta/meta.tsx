import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import { queryExtendedMetadata } from './queryExtendedMetadata';
import { getEmptyMetaState } from './getEmptyMetaState';
import {
  limitedLoadAccounts,
  loadAccounts,
  pullAuctionData,
  pullYourMetadata,
  USE_SPEED_RUN,
} from './loadAccounts';
import { MetaContextState, MetaState } from './types';
import { useConnection } from '../connection';
import { useStore } from '../store';
import { AuctionData, BidderMetadata, BidderPot } from '../../actions';
import {
  pullAuctionSubaccounts,
  pullPage,
  pullPayoutTickets,
  pullStoreMetadata,
  pullPacks,
  pullPack,
} from '.';
import { StringPublicKey, TokenAccount, useUserAccounts } from '../..';

const MetaContext = React.createContext<MetaContextState>({
  ...getEmptyMetaState(),
  isLoading: false,
  isFetching: false,
  // @ts-ignore
  update: () => [AuctionData, BidderMetadata, BidderPot],
});

export function MetaProvider({
  children = null,
}: {
  children: React.ReactNode;
}) {
  const connection = useConnection();
  const { isReady, storeAddress } = useStore();
  const wallet = useWallet();

  const [state, setState] = useState<MetaState>(getEmptyMetaState());
  const [page, setPage] = useState(0);
  const [
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _lastLength,
    setLastLength,
  ] = useState(0);
  const { userAccounts } = useUserAccounts();

  const [isLoading, setIsLoading] = useState(false);
  const updateRequestsInQueue = useRef(0);

  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const loadedMetadataLength = useRef(0);

  const updateMints = useCallback(
    async (metadataByMint: any) => {
      try {
        const { metadata, mintToMetadata } = await queryExtendedMetadata(
          connection,
          metadataByMint,
        );
        setState(current => ({
          ...current,
          metadata,
          metadataByMint: mintToMetadata,
        }));
      } catch (er) {
        console.error(er);
      }
    },
    [setState],
  );
  async function pullAllMetadata() {
    if (isLoading) return false;
    if (!storeAddress) {
      if (isReady) {
        setIsLoading(false);
      }
      return;
    } else if (!state.store) {
      setIsLoading(true);
    }
    setIsLoading(true);

    const nextState = await pullStoreMetadata(connection, state);

    setIsLoading(false);
    setState(nextState);
    await updateMints(nextState.metadataByMint);
    return [];
  }

  async function pullBillingPage(auctionAddress: StringPublicKey) {
    if (isLoading) return false;
    if (!storeAddress) {
      if (isReady) {
        setIsLoading(false);
      }
      return;
    } else if (!state.store) {
      setIsLoading(true);
    }
    const nextState = await pullAuctionSubaccounts(
      connection,
      auctionAddress,
      state,
    );

    await pullPayoutTickets(connection, nextState);

    setState(nextState);
    await updateMints(nextState.metadataByMint);
    return [];
  }

  async function pullAuctionListData(auctionAddress: StringPublicKey) {
    const nextState = await pullAuctionData(connection, auctionAddress, state);
    setState(nextState);
    await updateMints(nextState.metadataByMint);
    return nextState;
  }

  async function pullAuctionPage(auctionAddress: StringPublicKey) {
    if (isLoading) return state;
    if (!storeAddress) {
      if (isReady) {
        setIsLoading(false);
      }
      return state;
    } else if (!state.store) {
      setIsLoading(true);
    }
    const nextState = await pullAuctionSubaccounts(
      connection,
      auctionAddress,
      state,
    );
    setState(nextState);
    await updateMints(nextState.metadataByMint);
    return nextState;
  }

  async function pullItemsPage(
    userTokenAccounts: TokenAccount[],
  ): Promise<void> {
    if (isFetching) {
      return;
    }

    const shouldEnableNftPacks = process.env.NEXT_ENABLE_NFT_PACKS === 'true';
    const packsState = shouldEnableNftPacks
      ? await pullPacks(connection, state, wallet?.publicKey)
      : state;

    await pullUserMetadata(userTokenAccounts, packsState);
  }

  async function pullPackPage(
    userTokenAccounts: TokenAccount[],
    packSetKey: StringPublicKey,
  ): Promise<void> {
    if (isFetching) {
      return;
    }

    const packState = await pullPack({
      connection,
      state,
      packSetKey,
      walletKey: wallet?.publicKey,
    });

    await pullUserMetadata(userTokenAccounts, packState);
  }

  async function pullUserMetadata(
    userTokenAccounts: TokenAccount[],
    tempState?: MetaState,
  ): Promise<void> {
    setIsLoadingMetadata(true);
    loadedMetadataLength.current = userTokenAccounts.length;

    const nextState = await pullYourMetadata(
      connection,
      userTokenAccounts,
      tempState || state,
    );
    await updateMints(nextState.metadataByMint);

    setState(nextState);
    setIsLoadingMetadata(false);
  }

  async function pullAllSiteData() {
    if (isLoading) return state;
    if (!storeAddress) {
      if (isReady) {
        setIsLoading(false);
      }
      return state;
    } else if (!state.store) {
      setIsLoading(true);
    }

    const nextState = await loadAccounts(connection);

    setState(nextState);
    await updateMints(nextState.metadataByMint);
    return;
  }

  async function update(auctionAddress?: any, bidderAddress?: any) {
    if (!storeAddress) {
      if (isReady) {
        //@ts-ignore
        window.loadingData = false;
        setIsLoading(false);
      }
      return;
    } else if (!state.store) {
      //@ts-ignore
      window.loadingData = true;
      setIsLoading(true);
    }

    const shouldFetchNftPacks = process.env.NEXT_ENABLE_NFT_PACKS === 'true';
    let nextState = await pullPage(
      connection,
      page,
      state,
      wallet?.publicKey,
      shouldFetchNftPacks,
    );

    if (nextState.storeIndexer.length) {
      if (USE_SPEED_RUN) {
        nextState = await limitedLoadAccounts(connection);

        setState(nextState);

        //@ts-ignore
        window.loadingData = false;
        setIsLoading(false);
      } else {

        const auction = window.location.href.match(/#\/auction\/(\w+)/);
        const billing = window.location.href.match(
          /#\/auction\/(\w+)\/billing/,
        );
        if (auction && page == 0) {

          nextState = await pullAuctionSubaccounts(
            connection,
            auction[1],
            nextState,
          );

          if (billing) {
            await pullPayoutTickets(connection, nextState);
          }
        }

        let currLastLength;
        setLastLength(last => {
          currLastLength = last;
          return last;
        });
        if (nextState.storeIndexer.length != currLastLength) {
          setPage(page => page + 1);
        }
        setLastLength(nextState.storeIndexer.length);

        //@ts-ignore
        window.loadingData = false;
        setIsLoading(false);
        setState(nextState);
      }
    } else {
      nextState = !USE_SPEED_RUN
        ? await loadAccounts(connection)
        : await limitedLoadAccounts(connection);

      setState(nextState);

      //@ts-ignore
      window.loadingData = false;
      setIsLoading(false);
    }

    if (auctionAddress && bidderAddress) {
      nextState = await pullAuctionSubaccounts(
        connection,
        auctionAddress,
        nextState,
      );
      setState(nextState);

      const auctionBidderKey = auctionAddress + '-' + bidderAddress;
      return [
        nextState.auctions[auctionAddress],
        nextState.bidderPotsByAuctionAndBidder[auctionBidderKey],
        nextState.bidderMetadataByAuctionAndBidder[auctionBidderKey],
      ];
    }
  }

  useEffect(() => {
    //@ts-ignore
    if (window.loadingData) {
      updateRequestsInQueue.current += 1;
      const interval = setInterval(() => {
        //@ts-ignore
        if (window.loadingData) {
        } else {
          update(undefined, undefined);
          updateRequestsInQueue.current -= 1;
          clearInterval(interval);
        }
      }, 3000);
    } else {
      update(undefined, undefined);
      updateRequestsInQueue.current = 0;
    }
  }, [connection, setState, updateMints, storeAddress, isReady, page]);

  // Fetch metadata on userAccounts change
  useEffect(() => {
    const shouldFetch =
      !isLoading &&
      !isLoadingMetadata &&
      loadedMetadataLength.current !== userAccounts.length;

    if (shouldFetch) {
      pullUserMetadata(userAccounts);
    }
  }, [
    isLoading,
    isLoadingMetadata,
    loadedMetadataLength.current,
    userAccounts.length,
  ]);

  const isFetching = isLoading || updateRequestsInQueue.current > 0;

  return (
    <MetaContext.Provider
      value={{
        ...state,
        // @ts-ignore
        update,
        pullAuctionPage,
        pullAllMetadata,
        pullBillingPage,
        // @ts-ignore
        pullAllSiteData,
        pullItemsPage,
        pullPackPage,
        pullUserMetadata,
        pullAuctionListData,
        isLoading,
        isFetching,
      }}
    >
      {children}
    </MetaContext.Provider>
  );
}

export const useMeta = () => {
  const context = useContext(MetaContext);
  return context;
};
