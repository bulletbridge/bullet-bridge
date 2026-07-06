const BULLET_BRIDGE_NAME = "Bullet Bridge";

export function findOldBulletBridgeDevices(devices = [], localDevice = null) {
  const localIden = localDevice?.iden || "";
  const localFamily = bulletBridgeDeviceFamily(localDevice);
  if (!localIden || !localFamily) {
    return [];
  }

  return devices.filter((device) => {
    if (!device?.iden || device.iden === localIden || device.active === false) {
      return false;
    }

    const family = bulletBridgeDeviceFamily(device);
    return family === localFamily || family === BULLET_BRIDGE_NAME;
  });
}

export function bulletBridgeDeviceFamily(device) {
  const nickname = String(device?.nickname || "").trim();
  if (!nickname) {
    return "";
  }

  if (nickname === BULLET_BRIDGE_NAME) {
    return BULLET_BRIDGE_NAME;
  }

  const match = nickname.match(/^Bullet Bridge \((.+?)\)$/);
  if (!match) {
    return "";
  }

  const browserName = match[1].replace(/\s+#\d+$/, "").trim();
  return browserName ? `Bullet Bridge (${browserName})` : "";
}
