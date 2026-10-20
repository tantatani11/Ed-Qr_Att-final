import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import { useColors } from '@/lib/theme';

// Role → visible tabs:
//   student: Home, Scan, Events, History, Profile
//   teacher: Home, Teacher, History, Profile
//   admin:   Home, Teacher, Admin, Profile
// Screens themselves still gate access, so hiding here is UX;
// direct navigation to a forbidden tab shows the gate message.
export default function TabLayout() {
  const C = useColors();
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let active = true;
    if (!user) {
      setRole(null);
      return () => {
        active = false;
      };
    }
    const metaRole = (user.user_metadata as any)?.role as Role | undefined;
    getProfile(user.id)
      .then((profile) => {
        if (!active) return;
        setRole(profile?.role ?? metaRole ?? 'student');
      })
      .catch(() => {
        if (!active) return;
        setRole(metaRole ?? 'student');
      });
    return () => {
      active = false;
    };
  }, [user]);

  // While the role is still loading, default to the student view so the
  // Admin/Teacher tabs never flash for unauthorized users.
  const isTeacher = role === 'teacher';
  const isAdmin = role === 'admin';
  const isStudent = !role || role === 'student';

  const showScan = isStudent;
  const showEvents = isStudent;
  const showHistory = isStudent || isTeacher;
  const showTeacher = isTeacher || isAdmin;
  const showAdmin = isAdmin;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.primary,
        headerStyle: { backgroundColor: C.background },
        headerShadowVisible: false,
        headerTintColor: C.textPrimary,
        tabBarStyle: {
          backgroundColor: C.card,
          borderTopColor: C.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home-sharp' : 'home-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          href: showScan ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'qr-code' : 'qr-code-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          href: showEvents ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          href: showHistory ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'time' : 'time-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="teacher"
        options={{
          title: 'Teacher',
          href: showTeacher ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'clipboard' : 'clipboard-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          href: showAdmin ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'shield' : 'shield-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}
