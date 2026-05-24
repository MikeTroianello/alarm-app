import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useAudioPlayer } from "expo-audio";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Button,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NativeAlarmManager from "rn-native-alarmkit";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTheme } from "@/hooks/use-theme";
import {
  cancelMainAlarm,
  getNextAlarmDate,
  scheduleNextAlarm,
} from "@/lib/alarm";
import { loadAudioTracks, type SongAsset } from "@/lib/songs";

function getDefaultAlarmTime() {
  const time = new Date();
  time.setSeconds(0, 0);
  const minutes = time.getMinutes() + 2;
  time.setMinutes(minutes);
  return time;
}

function formatAlarmTime(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function TabTwoScreen() {
  const [alarmTime, setAlarmTime] = useState(getDefaultAlarmTime);
  const [songUri, setSongUri] = useState<string | null>(null);
  const [songLabel, setSongLabel] = useState<string | null>(null);
  const [songs, setSongs] = useState<SongAsset[]>([]);
  const [isSongPickerOpen, setIsSongPickerOpen] = useState(false);
  const [isLoadingSongs, setIsLoadingSongs] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [nextFireDate, setNextFireDate] = useState<Date | null>(null);
  const [capabilityLabel, setCapabilityLabel] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAndroidTimePicker, setShowAndroidTimePicker] = useState(false);

  const songUriRef = useRef(songUri);
  songUriRef.current = songUri;

  const alarmTimeRef = useRef(alarmTime);
  alarmTimeRef.current = alarmTime;

  const nextFireMsRef = useRef<number | null>(null);

  const player = useAudioPlayer(null);

  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();
  const colorScheme = useColorScheme();

  const playAlarmSound = useCallback(() => {
    // Android plays the selected track natively when the alarm fires.
    if (Platform.OS === "android") {
      return;
    }
    const uri = songUriRef.current;
    if (!uri) {
      return;
    }
    player.replace(uri);
    player.loop = true;
    player.play();
  }, [player]);

  const rescheduleFromRef = useCallback(async () => {
    if (!isScheduled) {
      return;
    }
    try {
      const result = await scheduleNextAlarm(
        alarmTimeRef.current,
        songUriRef.current,
      );
      nextFireMsRef.current = result.nextFireDate.getTime();
      setNextFireDate(result.nextFireDate);
      setCapabilityLabel(result.capability);
    } catch (error) {
      console.warn("Failed to reschedule alarm:", error);
    }
  }, [isScheduled]);

  useEffect(() => {
    const unsubscribeFired = NativeAlarmManager.onAlarmFired(() => {
      playAlarmSound();
      void rescheduleFromRef();
    });

    const unsubscribePermission = NativeAlarmManager.onPermissionChanged(
      (event) => {
        if (!event.granted) {
          setIsScheduled(false);
          setNextFireDate(null);
          nextFireMsRef.current = null;
        }
      },
    );

    return () => {
      unsubscribeFired();
      unsubscribePermission();
    };
  }, [playAlarmSound, rescheduleFromRef]);

  // Native alarm events often do not reach JS when the app is killed; play when
  // the user opens the app around the scheduled time (e.g. after tapping the notification).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !songUriRef.current || !nextFireMsRef.current) {
        return;
      }
      const delta = Math.abs(Date.now() - nextFireMsRef.current);
      if (delta < 3 * 60 * 1000) {
        playAlarmSound();
      }
    });

    return () => subscription.remove();
  }, [playAlarmSound]);

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  const onTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowAndroidTimePicker(false);
    }
    if (event.type === "dismissed") {
      return;
    }
    if (selectedDate) {
      setAlarmTime(selectedDate);
      setIsScheduled(false);
      setNextFireDate(null);
      nextFireMsRef.current = null;
    }
  };

  const chooseSong = async () => {
    setIsLoadingSongs(true);
    try {
      const tracks = await loadAudioTracks();
      if (tracks.length === 0) {
        Alert.alert(
          "No audio found",
          "Add music files to your device, then try again.",
        );
        return;
      }
      setSongs(tracks);
      setIsSongPickerOpen(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load songs.";
      Alert.alert("Song library", message);
    } finally {
      setIsLoadingSongs(false);
    }
  };

  const selectSong = (song: SongAsset) => {
    setSongUri(song.uri);
    setSongLabel(song.filename);
    setIsSongPickerOpen(false);
  };

  const setAlarm = async () => {
    if (!songUri) {
      Alert.alert("Choose a song", "Pick a track before setting the alarm.");
      return;
    }
    setIsSaving(true);
    try {
      const result = await scheduleNextAlarm(alarmTime, songUri);
      nextFireMsRef.current = result.nextFireDate.getTime();
      setNextFireDate(result.nextFireDate);
      setCapabilityLabel(result.capability);
      setIsScheduled(true);

      const modeHint =
        result.capability === "native_alarms"
          ? "Exact system alarm"
          : "Notification-based alarm (enable Alarms & reminders for best results)";

      Alert.alert(
        "Alarm set",
        `Rings at ${formatAlarmTime(result.nextFireDate)}.\n${modeHint}`,
      );
    } catch (error) {
      setIsScheduled(false);
      setNextFireDate(null);
      nextFireMsRef.current = null;
      const message =
        error instanceof Error ? error.message : "Could not schedule alarm.";
      Alert.alert("Alarm failed", message);
    } finally {
      setIsSaving(false);
    }
  };

  const cancelAlarm = async () => {
    try {
      await cancelMainAlarm();
      if (Platform.OS !== "android") {
        player.pause();
      }
      setIsScheduled(false);
      setNextFireDate(null);
      nextFireMsRef.current = null;
      Alert.alert("Alarm cancelled");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not cancel alarm.";
      Alert.alert("Cancel failed", message);
    }
  };

  const previewSong = () => {
    if (!songUri) {
      return;
    }
    player.replace(songUri);
    player.loop = false;
    player.play();
  };

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
    >
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle">Set Alarm</ThemedText>

        <ThemedView type="backgroundElement" style={styles.timeSection}>
          <ThemedText type="smallBold">Alarm time</ThemedText>
          {Platform.OS === "android" ? (
            <Pressable
              onPress={() => setShowAndroidTimePicker(true)}
              style={({ pressed }) => [
                styles.timeTapTarget,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText type="title" style={styles.timeDisplay}>
                {formatAlarmTime(alarmTime)}
              </ThemedText>
              <ThemedText themeColor="textSecondary" type="small">
                Tap to change time
              </ThemedText>
            </Pressable>
          ) : (
            <>
              <ThemedText type="title" style={styles.timeDisplay}>
                {formatAlarmTime(alarmTime)}
              </ThemedText>
              <DateTimePicker
                value={alarmTime}
                mode="time"
                display="spinner"
                onChange={onTimeChange}
                themeVariant={colorScheme === "dark" ? "dark" : "light"}
              />
            </>
          )}
          {nextFireDate ? (
            <ThemedText themeColor="textSecondary" type="small">
              Next ring: {formatAlarmTime(nextFireDate)}
              {capabilityLabel ? ` (${capabilityLabel})` : ""}
            </ThemedText>
          ) : (
            <ThemedText themeColor="textSecondary" type="small">
              Next ring: {formatAlarmTime(getNextAlarmDate(alarmTime))}
            </ThemedText>
          )}
          {showAndroidTimePicker ? (
            <DateTimePicker
              value={alarmTime}
              mode="time"
              display="default"
              onChange={onTimeChange}
            />
          ) : null}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.songSection}>
          <ThemedText type="smallBold">Alarm song</ThemedText>
          <ThemedText themeColor="textSecondary" type="small">
            {songLabel ?? "No song selected"}
          </ThemedText>
          <Button
            title={isLoadingSongs ? "Loading…" : "Choose song"}
            onPress={chooseSong}
            disabled={isLoadingSongs}
          />
          {songUri ? (
            <Button title="Preview song" onPress={previewSong} />
          ) : null}
        </ThemedView>

        {isSongPickerOpen ? (
          <ThemedView type="backgroundElement" style={styles.songList}>
            <ThemedText type="smallBold">Pick a track</ThemedText>
            {isLoadingSongs ? (
              <ActivityIndicator />
            ) : (
              songs.map((song) => (
                <Pressable
                  key={song.id}
                  onPress={() => selectSong(song)}
                  style={({ pressed }) => [
                    styles.songRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText type="default">{song.filename}</ThemedText>
                  <ThemedText themeColor="textSecondary" type="small">
                    {formatDuration(song.duration)}
                  </ThemedText>
                </Pressable>
              ))
            )}
            <Button
              title="Close list"
              onPress={() => setIsSongPickerOpen(false)}
            />
          </ThemedView>
        ) : null}

        <Button
          title={isSaving ? "Saving…" : "Set alarm"}
          onPress={setAlarm}
          disabled={isSaving}
        />
        {isScheduled ? (
          <Button title="Cancel alarm" onPress={cancelAlarm} color="#c62828" />
        ) : null}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: "row",
    justifyContent: "center",
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  timeSection: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    alignItems: "center",
  },
  songSection: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  songList: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.four,
    maxHeight: 280,
  },
  songRow: {
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  timeDisplay: {
    fontVariant: ["tabular-nums"],
  },
  timeTapTarget: {
    alignItems: "center",
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
