import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Edit3,
  ImagePlus,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react-native';

import { FIELD_GUIDE } from '../data/fieldGuide';
import { loadJson, saveJson } from '../services/persistence';
import { colors, sharedStyles, touchTarget } from '../theme';

const STORAGE_KEY_GUIDE = 'guide:cards_v2';

type PhotoEntry =
  | { kind: 'builtin'; builtinId: string }
  | { kind: 'uri'; uri: string };

interface StoredGuideCard {
  id: string;
  title: string;
  norwegianName: string | null;
  photos: PhotoEntry[];
  points: string[];
  isCustom?: boolean;
}

function buildDefaultCards(): StoredGuideCard[] {
  return FIELD_GUIDE.map((c) => ({
    id: c.id,
    title: c.title,
    norwegianName: c.norwegianName,
    photos: [{ kind: 'builtin', builtinId: c.id }],
    points: [...c.points],
  }));
}

function resolvePhotoSource(photo: PhotoEntry): ImageSourcePropType | null {
  if (photo.kind === 'uri') {
    return { uri: photo.uri };
  }
  const found = FIELD_GUIDE.find((c) => c.id === photo.builtinId);
  return found ? found.image : null;
}

export function FieldGuideScreen() {
  const [cards, setCards] = useState<StoredGuideCard[]>(() => buildDefaultCards());
  const [hydrated, setHydrated] = useState(false);
  const [openId, setOpenId] = useState<string | null>(FIELD_GUIDE[0]?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPointText, setNewPointText] = useState('');

  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicNo, setNewTopicNo] = useState('');
  const [newTopicPoint, setNewTopicPoint] = useState('');

  const [lightbox, setLightbox] = useState<{
    photos: PhotoEntry[];
    index: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void loadJson<StoredGuideCard[]>(STORAGE_KEY_GUIDE).then((stored) => {
      if (!active) return;
      if (Array.isArray(stored) && stored.length > 0) {
        setCards(stored);
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveJson(STORAGE_KEY_GUIDE, cards);
  }, [cards, hydrated]);

  const pickPhoto = async (cardId: string, useCamera: boolean) => {
    try {
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Permission Needed', 'Allow camera access to take a photo.');
          return;
        }
        const res = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.75,
        });
        if (!res.canceled && res.assets[0]?.uri) {
          const uri = res.assets[0].uri;
          setCards((prev) =>
            prev.map((c) =>
              c.id === cardId
                ? { ...c, photos: [...c.photos, { kind: 'uri', uri }] }
                : c
            )
          );
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Permission Needed', 'Allow photo library access to add pictures.');
          return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.75,
        });
        if (!res.canceled && res.assets[0]?.uri) {
          const uri = res.assets[0].uri;
          setCards((prev) =>
            prev.map((c) =>
              c.id === cardId
                ? { ...c, photos: [...c.photos, { kind: 'uri', uri }] }
                : c
            )
          );
        }
      }
    } catch {
      Alert.alert('Photo Error', 'Could not open image picker.');
    }
  };

  const removePhoto = (cardId: string, photoIdx: number) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, photos: c.photos.filter((_, i) => i !== photoIdx) }
          : c
      )
    );
  };

  const updatePoint = (cardId: string, pointIdx: number, text: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? {
              ...c,
              points: c.points.map((p, i) => (i === pointIdx ? text : p)),
            }
          : c
      )
    );
  };

  const removePoint = (cardId: string, pointIdx: number) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, points: c.points.filter((_, i) => i !== pointIdx) }
          : c
      )
    );
  };

  const addPoint = (cardId: string) => {
    const clean = newPointText.trim();
    if (!clean) return;
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId ? { ...c, points: [...c.points, clean] } : c
      )
    );
    setNewPointText('');
  };

  const addCustomTopic = () => {
    const title = newTopicTitle.trim();
    if (!title) return;
    const id = `custom-${Date.now().toString(36)}`;
    const newCard: StoredGuideCard = {
      id,
      title,
      norwegianName: newTopicNo.trim() || null,
      photos: [],
      points: newTopicPoint.trim() ? [newTopicPoint.trim()] : [],
      isCustom: true,
    };
    setCards((prev) => [...prev, newCard]);
    setOpenId(id);
    setEditingId(id);
    setNewTopicTitle('');
    setNewTopicNo('');
    setNewTopicPoint('');
    setShowAddTopic(false);
  };

  const deleteCustomCard = (cardId: string) => {
    Alert.alert('Delete Topic?', 'Remove this custom topic from Field Guide?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setCards((prev) => prev.filter((c) => c.id !== cardId));
          if (openId === cardId) setOpenId(null);
          if (editingId === cardId) setEditingId(null);
        },
      },
    ]);
  };

  const resetDefaults = () => {
    Alert.alert(
      'Reset Field Guide?',
      'Restore default talking points and photos? Custom topics will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setCards(buildDefaultCards());
            setEditingId(null);
          },
        },
      ]
    );
  };

  const activeLightboxSource = lightbox
    ? lightbox.photos[lightbox.index]
      ? resolvePhotoSource(lightbox.photos[lightbox.index]!)
      : null
    : null;

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.content}>
      <View style={styles.topRow}>
        <Text style={[sharedStyles.secondary, { flex: 1 }]}>
          Tap a photo to show guests full-screen (hides notes).
        </Text>
        <Pressable
          onPress={() => setShowAddTopic((v) => !v)}
          style={({ pressed }) => [styles.addTopicBtn, pressed && styles.pressed]}
        >
          <Plus color={colors.background} size={16} />
          <Text style={styles.addTopicBtnText}>New Topic</Text>
        </Pressable>
      </View>

      {showAddTopic ? (
        <View style={[sharedStyles.card, styles.addTopicCard]}>
          <Text style={styles.formHeader}>ADD ANIMAL / TOPIC</Text>
          <TextInput
            value={newTopicTitle}
            onChangeText={setNewTopicTitle}
            placeholder="Title (e.g. Moose, Sea Eagle)"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />
          <TextInput
            value={newTopicNo}
            onChangeText={setNewTopicNo}
            placeholder="Norwegian name (optional, e.g. Elg)"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />
          <TextInput
            value={newTopicPoint}
            onChangeText={setNewTopicPoint}
            placeholder="First talking point..."
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />
          <Pressable
            onPress={addCustomTopic}
            style={({ pressed }) => [touchTarget, styles.saveBtn, pressed && styles.pressed]}
          >
            <Text style={styles.saveBtnText}>Create Topic</Text>
          </Pressable>
        </View>
      ) : null}

      {cards.map((card) => {
        const open = openId === card.id;
        const isEditing = editingId === card.id;
        const thumbSource = card.photos[0] ? resolvePhotoSource(card.photos[0]) : null;

        return (
          <View
            key={card.id}
            style={[styles.card, open && styles.cardOpen]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => setOpenId(open ? null : card.id)}
              style={({ pressed }) => [touchTarget, styles.headerPress, pressed && styles.pressed]}
            >
              <View style={styles.titleRow}>
                {!open && thumbSource ? (
                  <Image source={thumbSource} style={styles.thumb} resizeMode="cover" />
                ) : null}
                <View style={styles.titles}>
                  <Text style={styles.title}>{card.title}</Text>
                  {card.norwegianName ? (
                    <Text style={styles.norwegian}>{card.norwegianName}</Text>
                  ) : null}
                </View>
                {open ? (
                  <ChevronUp color={colors.accent} size={26} />
                ) : (
                  <ChevronDown color={colors.textSecondary} size={26} />
                )}
              </View>
              {!open && card.points[0] ? (
                <Text style={styles.teaser} numberOfLines={2}>
                  {card.points[0]}
                </Text>
              ) : null}
            </Pressable>

            {open ? (
              <View style={styles.expandedBody}>
                {/* Photo Gallery */}
                {card.photos.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.galleryRow}
                  >
                    {card.photos.map((photo, pIdx) => {
                      const src = resolvePhotoSource(photo);
                      if (!src) return null;
                      return (
                        <View key={`${card.id}-p-${pIdx}`} style={styles.photoWrap}>
                          <Pressable
                            onPress={() =>
                              setLightbox({ photos: card.photos, index: pIdx })
                            }
                            style={({ pressed }) => [pressed && styles.pressed]}
                          >
                            <Image source={src} style={styles.heroImage} resizeMode="cover" />
                          </Pressable>
                          {isEditing ? (
                            <Pressable
                              onPress={() => removePhoto(card.id, pIdx)}
                              style={styles.removePhotoBtn}
                            >
                              <X color={colors.text} size={14} />
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })}
                  </ScrollView>
                ) : null}

                {/* Add Photos & Edit Toggle Bar */}
                <View style={styles.cardControlsRow}>
                  <Pressable
                    onPress={() => void pickPhoto(card.id, false)}
                    style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                  >
                    <ImagePlus color={colors.accent} size={16} />
                    <Text style={styles.smallBtnText}>Gallery</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void pickPhoto(card.id, true)}
                    style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                  >
                    <Camera color={colors.accent} size={16} />
                    <Text style={styles.smallBtnText}>Camera</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setEditingId(isEditing ? null : card.id)}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      isEditing && styles.smallBtnActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Edit3
                      color={isEditing ? colors.background : colors.text}
                      size={16}
                    />
                    <Text
                      style={[
                        styles.smallBtnText,
                        isEditing && { color: colors.background },
                      ]}
                    >
                      {isEditing ? 'Done' : 'Edit'}
                    </Text>
                  </Pressable>
                  {isEditing && card.isCustom ? (
                    <Pressable
                      onPress={() => deleteCustomCard(card.id)}
                      style={styles.smallDeleteBtn}
                    >
                      <Trash2 color={colors.danger} size={16} />
                    </Pressable>
                  ) : null}
                </View>

                {/* Talking Points */}
                {card.points.map((point, idx) =>
                  isEditing ? (
                    <View key={`${card.id}-pt-${idx}`} style={styles.editPointRow}>
                      <TextInput
                        value={point}
                        onChangeText={(txt) => updatePoint(card.id, idx, txt)}
                        style={[styles.input, { flex: 1 }]}
                        multiline
                      />
                      <Pressable
                        onPress={() => removePoint(card.id, idx)}
                        style={styles.smallDeleteBtn}
                      >
                        <Trash2 color={colors.danger} size={16} />
                      </Pressable>
                    </View>
                  ) : (
                    <Text key={`${card.id}-pt-${idx}`} style={styles.point}>
                      • {point}
                    </Text>
                  )
                )}

                {isEditing ? (
                  <View style={styles.editPointRow}>
                    <TextInput
                      value={newPointText}
                      onChangeText={setNewPointText}
                      placeholder="Add new talking point..."
                      placeholderTextColor={colors.textSecondary}
                      style={[styles.input, { flex: 1 }]}
                    />
                    <Pressable
                      onPress={() => addPoint(card.id)}
                      style={styles.addPointBtn}
                    >
                      <Plus color={colors.background} size={18} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      <Pressable
        onPress={resetDefaults}
        style={({ pressed }) => [styles.resetRow, pressed && styles.pressed]}
      >
        <RotateCcw color={colors.textSecondary} size={15} />
        <Text style={styles.resetText}>Reset Field Guide to Defaults</Text>
      </Pressable>

      {/* Full-Screen Guest Photo Lightbox (No Text!) */}
      <Modal
        visible={lightbox !== null}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setLightbox(null)}
      >
        <View style={styles.lightboxScreen}>
          <Pressable
            hitSlop={14}
            onPress={() => setLightbox(null)}
            style={styles.lightboxClose}
          >
            <X color={colors.text} size={28} />
          </Pressable>

          {activeLightboxSource ? (
            <Image
              source={activeLightboxSource}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          ) : null}

          {lightbox && lightbox.photos.length > 1 ? (
            <View style={styles.lightboxNav}>
              <Pressable
                onPress={() =>
                  setLightbox((prev) =>
                    prev
                      ? {
                          ...prev,
                          index:
                            (prev.index - 1 + prev.photos.length) %
                            prev.photos.length,
                        }
                      : null
                  )
                }
                style={styles.lightboxArrow}
              >
                <ChevronLeft color={colors.text} size={28} />
              </Pressable>
              <Text style={styles.lightboxCounter}>
                {lightbox.index + 1} / {lightbox.photos.length}
              </Text>
              <Pressable
                onPress={() =>
                  setLightbox((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: (prev.index + 1) % prev.photos.length,
                        }
                      : null
                  )
                }
                style={styles.lightboxArrow}
              >
                <ChevronRight color={colors.text} size={28} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addTopicBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addTopicBtnText: { color: colors.background, fontSize: 13, fontWeight: '800' },
  addTopicCard: { gap: 8 },
  formHeader: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  input: {
    minHeight: 44,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 15,
  },
  saveBtn: { backgroundColor: colors.accent, borderRadius: 12, minHeight: 48 },
  saveBtnText: { color: colors.background, fontSize: 16, fontWeight: '800' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cardOpen: { borderColor: colors.accent },
  headerPress: { width: '100%', alignItems: 'stretch', gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#09090B' },
  titles: { flex: 1 },
  title: { color: colors.text, fontSize: 21, fontWeight: '800' },
  norwegian: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  teaser: { color: colors.textSecondary, fontSize: 15, lineHeight: 21 },
  expandedBody: { gap: 10, marginTop: 8 },
  galleryRow: { gap: 10, paddingVertical: 2 },
  photoWrap: { position: 'relative' },
  heroImage: {
    width: 260,
    height: 180,
    borderRadius: 12,
    backgroundColor: '#09090B',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardControlsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  smallBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  smallBtnText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  smallDeleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: '#09090B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editPointRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addPointBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  point: { color: colors.text, fontSize: 19, lineHeight: 28, fontWeight: '600' },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  resetText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  lightboxScreen: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  lightboxImage: { width: '100%', height: '82%' },
  lightboxNav: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  lightboxArrow: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxCounter: { color: colors.text, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.78 },
});