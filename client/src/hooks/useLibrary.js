import { useContext } from 'react';
import { LibraryContext } from '../contexts/libraryContextBase';

export function useLibrary() {
  return useContext(LibraryContext);
}
