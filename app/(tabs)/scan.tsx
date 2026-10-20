import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import AppButton from '@/components/AppButton';
import type { Palette } from '@/constants/colors';
import { useColors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { registerAttendance } from '@/lib/attendance';

const FRAME_SIZE = 250;

export default function ScanScreen() {
  const C = useColors();
  const styles = makeStyles(C);
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastData, setLastData] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionIcon}>
          <Ionicons name="camera-outline" size={40} color={C.primary} />
        </View>
        <Text style={styles.title}>Camera Permission Needed</Text>
        <Text style={styles.subtitle}>
          We need access to your camera to scan QR codes.
        </Text>
        <AppButton
          theme="primary"
          title="Grant Permission"
          icon="camera"
          onPress={requestPermission}
        />
      </View>
    );
  }

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    setScanned(true);
    setLastData(data);
    if (!user) {
      setMessage('Please sign in before scanning.');
      setSuccess(false);
      return;
    }
    registerAttendance(data, user.id).then((result) => {
      setMessage(result.message);
      setSuccess(result.success);
    });
  };

  const handleScanAgain = () => {
    setScanned(false);
    setLastData(null);
    setMessage(null);
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {!scanned ? (
        <>
          <View style={styles.topBar}>
            <View style={styles.topBarChip}>
              <Ionicons name="scan-outline" size={16} color={C.primary} />
              <Text style={styles.topBarText}>Point your camera at a QR code</Text>
            </View>
          </View>

          <View style={styles.frameWrap}>
            <View style={styles.frame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
          </View>
        </>
      ) : (
        <View style={styles.overlay}>
          <View
            style={[
              styles.statusIcon,
              success ? styles.statusSuccess : styles.statusError,
            ]}
          >
            <Ionicons
              name={success ? 'checkmark' : 'alert'}
              size={26}
              color={success ? C.success : C.danger}
            />
          </View>
          <Text
            style={[styles.scanResult, success ? styles.success : styles.error]}
          >
            {message ?? 'QR Code detected!'}
          </Text>
          {lastData && (
            <Text style={styles.scanData} numberOfLines={2}>
              {lastData}
            </Text>
          )}
          <AppButton
            theme="primary"
            title="Scan Again"
            icon="refresh"
            onPress={handleScanAgain}
          />
        </View>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  permissionIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.primary + '1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  topBar: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  topBarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topBarText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textPrimary,
  },
  frameWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -FRAME_SIZE / 2,
    marginTop: -FRAME_SIZE / 2,
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: C.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  overlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 80,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    alignItems: 'center',
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusSuccess: {
    backgroundColor: C.success + '1A',
  },
  statusError: {
    backgroundColor: C.danger + '1A',
  },
  scanResult: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 4,
    fontWeight: '600',
  },
  success: {
    color: C.success,
  },
  error: {
    color: C.danger,
  },
  scanData: {
    fontSize: 12,
    color: C.textSecondary,
    textAlign: 'center',
    marginBottom: 14,
    width: '100%',
  },
});