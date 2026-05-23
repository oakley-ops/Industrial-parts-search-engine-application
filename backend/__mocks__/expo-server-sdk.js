/**
 * Manual CJS mock for expo-server-sdk (pure ESM, incompatible with ts-jest CJS mode).
 * jest.mock('expo-server-sdk') will use this file automatically.
 */
const Expo = jest.fn().mockImplementation(() => ({
  sendPushNotificationsAsync: jest.fn(),
}));

Expo.isExpoPushToken = jest.fn().mockReturnValue(true);

module.exports = Expo;
module.exports.default = Expo;
module.exports.Expo = Expo;
