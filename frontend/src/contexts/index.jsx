import { createContext, useContext } from "react";
import { C_LIGHT } from "../constants/theme";
import { T } from "../constants/translations";
import { PROVIDERS, MY_BOOKINGS } from "../constants/data";

export const ThemeCtx = createContext(C_LIGHT);
export const useC = () => useContext(ThemeCtx);

export const LangCtx = createContext(T.bn);
export const useTr = () => useContext(LangCtx);

export const FavsCtx = createContext({ favs: [], toggleFav: () => {} });

/** Shared live data – providers, bookings, wallet balance */
export const LiveDataCtx = createContext({
  providers: PROVIDERS,
  bookings:  MY_BOOKINGS,
  balance:   1545,
  setBalance: () => {},
  refreshBookings: async () => {},
});
export const useLiveData = () => useContext(LiveDataCtx);

/** Auth user context — available to all child components */
export const UserCtx = createContext({ user: null });
export const useUser = () => useContext(UserCtx);
