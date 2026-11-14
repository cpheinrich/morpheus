export type FragmentViewOptions<V> = {
    /** The view before the browser's fragment has been read (server render and first paint). */
    initial: V;
    /** Restore a view from `location.hash`, given what this page saved in `history.state`. */
    read: (hash: string, saved: V | undefined) => V;
    /** The fragment for a view; `""` for the default view. */
    write: (view: V) => string;
    /** The `history.state` key that holds this page's view. */
    historyKey: string;
};
/**
 * A desk view addressed by the URL fragment. Navigating pushes one history entry per distinct
 * fragment, so Back and Forward, a reload and a shared link all restore the same view; the saved
 * state carries choices the fragment leaves out (an inactive tab's mode) for this session only.
 */
export declare function useFragmentView<V>({ initial, read, write, historyKey }: FragmentViewOptions<V>): {
    view: V;
    navigate: (next: V) => void;
};
