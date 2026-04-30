import { useCallback, useEffect, useState } from "react";

export function useResource(fn, deps) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
  });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((e) => setState({ data: null, loading: false, error: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps || []);

  useEffect(() => {
    load();
  }, [load]);

  return [state, load];
}
