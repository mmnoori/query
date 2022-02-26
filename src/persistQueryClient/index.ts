import { QueryClient } from '../core'
import {
  dehydrate,
  DehydratedState,
  DehydrateOptions,
  HydrateOptions,
  hydrate,
} from 'react-query'
import { Promisable } from 'type-fest'

export interface Persister {
  persistClient(persistClient: PersistedClient): Promisable<void>
  restoreClient(): Promisable<PersistedClient | undefined>
  removeClient(): Promisable<void>
}

export interface PersistedClient {
  timestamp: number
  buster: string
  clientState: DehydratedState
}

export interface PersistQueryClienRootOptions {
  /** The QueryClient to persist */
  queryClient: QueryClient
  /** The Persister interface for storing and restoring the cache
   * to/from a persisted location */
  persister: Persister
  /** A unique string that can be used to forcefully
   * invalidate existing caches if they do not share the same buster string */
  buster?: string
}

export interface PersistedQueryClientRestoreOptions
  extends PersistQueryClienRootOptions {
  /** The max-allowed age of the cache in milliseconds.
   * If a persisted cache is found that is older than this
   * time, it will be discarded */
  maxAge?: number
  /** The options passed to the hydrate function */
  hydrateOptions?: HydrateOptions
}

export interface PersistedQueryClientSaveOptions
  extends PersistQueryClienRootOptions {
  /** The options passed to the dehydrate function */
  dehydrateOptions?: DehydrateOptions
}

export interface PersistQueryClientOptions
  extends PersistedQueryClientRestoreOptions,
    PersistedQueryClientSaveOptions,
    PersistQueryClienRootOptions {}

/**
 * Restores persisted data to the QueryCache
 *  - data obtained from persister.restoreClient
 *  - data is hydrated using hydrateOptions
 * If data is expired, busted, empty, or throws, it runs persister.removeClient
 */
export async function persistQueryClientRestore({
  queryClient,
  persister,
  maxAge = 1000 * 60 * 60 * 24,
  buster = '',
  hydrateOptions,
}: PersistedQueryClientRestoreOptions) {
  if (typeof window !== 'undefined') {
    try {
      const persistedClient = await persister.restoreClient()

      if (persistedClient) {
        if (persistedClient.timestamp) {
          const expired = Date.now() - persistedClient.timestamp > maxAge
          const busted = persistedClient.buster !== buster
          if (expired || busted) {
            persister.removeClient()
          } else {
            hydrate(queryClient, persistedClient.clientState, hydrateOptions)
          }
        } else {
          persister.removeClient()
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        queryClient.getLogger().error(err)
        queryClient
          .getLogger()
          .warn(
            'Encountered an error attempting to restore client cache from persisted location. As a precaution, the persisted cache will be discarded.'
          )
      }
      persister.removeClient()
    }
  }
}

/**
 * Persists data from the QueryCache
 *  - data dehydrated using dehydrateOptions
 *  - data is persisted using persister.persistClient
 */
export async function persistQueryClientSave({
  queryClient,
  persister,
  buster = '',
  dehydrateOptions,
}: PersistedQueryClientSaveOptions) {
  if (typeof window !== 'undefined') {
    const persistClient: PersistedClient = {
      buster,
      timestamp: Date.now(),
      clientState: dehydrate(queryClient, dehydrateOptions),
    }

    await persister.persistClient(persistClient)
  }
}

/**
 * Subscribe to QueryCache updates (for persisting)
 * @returns an unsubscribe function (to discontinue monitoring)
 */
export function persistQueryClientSubscribe(
  props: PersistedQueryClientSaveOptions
) {
  return props.queryClient.getQueryCache().subscribe(() => {
    persistQueryClientSave(props)
  })
}

/**
 * Restores persisted data to QueryCache and persists further changes.
 * (Retained for backwards compatibility)
 */
export async function persistQueryClient(props: PersistQueryClientOptions) {
  if (typeof window !== 'undefined') {
    // Attempt restore
    await persistQueryClientRestore(props)

    // Subscribe to changes in the query cache to trigger the save
    return persistQueryClientSubscribe(props)
  }
}
