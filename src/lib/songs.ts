import * as MediaLibrary from "expo-media-library";
import type { Asset } from "expo-media-library";

export type SongAsset = Pick<Asset, "id" | "uri" | "filename" | "duration">;

export async function requestSongLibraryAccess(): Promise<boolean> {
  const current = await MediaLibrary.getPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const { granted, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
  if (granted) {
    return true;
  }

  if (!canAskAgain) {
    throw new Error(
      "Media access is required to pick a song. Enable it in app settings.",
    );
  }

  return false;
}

export async function loadAudioTracks(limit = 40): Promise<SongAsset[]> {
  const granted = await requestSongLibraryAccess();
  if (!granted) {
    throw new Error("Permission is required to browse audio on your device.");
  }

  const page = await MediaLibrary.getAssetsAsync({
    mediaType: MediaLibrary.MediaType.audio,
    first: limit,
    sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
  });

  return page.assets.map((asset) => ({
    id: asset.id,
    uri: asset.uri,
    filename: asset.filename,
    duration: asset.duration,
  }));
}
