/**
 * Where the Django API runs. On the emulator, `adb reverse tcp:8001 tcp:8001` makes the computer's
 * localhost reachable as the phone's localhost. Set EXPO_PUBLIC_API_URL for a real server.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8001';
