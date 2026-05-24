import { NativeAlarmModule } from "rn-native-alarmkit/lib/module/NativeAlarmModule";
import NativeAlarmManager from "rn-native-alarmkit";
import type { AlarmCapabilityCheck, AlarmSchedule } from "rn-native-alarmkit";
import { PermissionsAndroid, Platform } from "react-native";

export const MAIN_ALARM_ID = "main-alarm";

const ALARM_CONFIG = {
  title: "Alarm",
  body: "Time to wake up",
  actions: [
    { id: "dismiss", title: "Dismiss", behavior: "dismiss" as const },
    {
      id: "snooze",
      title: "Snooze 10m",
      behavior: "snooze" as const,
      snoozeDuration: 10,
    },
  ],
};

/** Next calendar time matching hour/minute (today or tomorrow). */
export function getNextAlarmDate(time: Date): Date {
  const next = new Date();
  next.setSeconds(0, 0);
  next.setMilliseconds(0);
  next.setHours(time.getHours(), time.getMinutes(), 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function buildNextAlarmSchedule(time: Date): AlarmSchedule {
  const next = getNextAlarmDate(time);
  return {
    id: MAIN_ALARM_ID,
    type: "fixed",
    time: {
      hour: next.getHours(),
      minute: next.getMinutes(),
    },
    date: next,
  };
}

async function ensureNotificationPermission() {
  if (Platform.OS === "android" && Platform.Version >= 33) {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  }
}

export async function ensureAlarmPermissions(): Promise<AlarmCapabilityCheck> {
  let capability = await NativeAlarmManager.checkCapability();

  if (capability.capability === "none") {
    throw new Error("This device cannot schedule alarms.");
  }

  if (capability.requiresPermission && capability.canRequestPermission) {
    await NativeAlarmManager.requestPermission();
    capability = await NativeAlarmManager.checkCapability();
  }

  await ensureNotificationPermission();

  return capability;
}

/**
 * Schedules the next one-shot alarm. Uses the native module directly so
 * inexact/notification fallback still works when exact-alarm permission is off.
 */
export async function scheduleNextAlarm(
  time: Date,
  songUri?: string | null,
) {
  const capability = await ensureAlarmPermissions();

  if (
    capability.capability === "native_alarms" &&
    capability.requiresPermission
  ) {
    throw new Error(
      "Enable Alarms & reminders for this app in system settings, then tap Set alarm again.",
    );
  }

  await NativeAlarmModule.cancelAlarm(MAIN_ALARM_ID).catch(() => {});

  const config = {
    ...ALARM_CONFIG,
    sound: songUri ? ("none" as const) : ("default" as const),
    ...(songUri ? { data: { songUri } } : {}),
  };

  const scheduled = await NativeAlarmModule.scheduleAlarm(
    buildNextAlarmSchedule(time),
    config,
  );

  return {
    scheduled,
    nextFireDate: getNextAlarmDate(time),
    capability: capability.capability,
  };
}

export async function cancelMainAlarm() {
  await NativeAlarmModule.cancelAlarm(MAIN_ALARM_ID);
}
