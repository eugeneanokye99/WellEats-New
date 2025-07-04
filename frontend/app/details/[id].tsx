// File: app/details/[id].tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getMealDetails,
  getNutritionByIngredient,
  getAllergenFlags,
} from '../../services/api';
import { getMealById, Meal } from '@/services/localData';

type IngredientInfo = {
  name: string;
  measure: string;
  nutrition: {
    calories: number;
    protein:  number;
    fat:      number;
    sugars:   number;
    sodium:   number;
  };
  allergens: string[];
};

const FAVORITES_KEY = 'FAVORITES';
const HISTORY_KEY   = 'HISTORY';
const MAX_HISTORY   = 50;

export default function DetailsScreen() {
  const { id }             = useLocalSearchParams<{ id: string }>();
  const isDarkMode         = useColorScheme() === 'dark';
  const router             = useRouter();

  const [dish, setDish]               = useState<any>(null);
  const [loadingDish, setLoadingDish] = useState(true);
  const [ingredients, setIngredients]     = useState<IngredientInfo[]>([]);
  const [loadingNutrition, setLoadingNut] = useState(true);
  const [isFavorite, setIsFavorite]       = useState(false);
  const [localMeal, setLocalMeal] = useState<Meal | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(true);

  // 1️⃣ Fetch meal: check local dataset first, then remote; check favorite & record history
  useEffect(() => {
    (async () => {
      // Try local dataset first
      const m = getMealById(id);
      if (m) {
        setLocalMeal(m);
        // Build a minimal `dish` object so UI code can rely on it if needed
        setDish({
          idMeal: m.id,
          strMeal: m.name,
          strMealThumb: m.thumbnail,
          strInstructions: m.instructions,
        });
        // Check favorites (using the same key logic as remote)
        const favJson = await AsyncStorage.getItem(FAVORITES_KEY);
        const favList = favJson ? JSON.parse(favJson) : [];
        setIsFavorite(favList.some((f: any) => f.idMeal === m.id));

        // Record to history for local meal
        const histJson = await AsyncStorage.getItem(HISTORY_KEY);
        let histList = histJson ? JSON.parse(histJson) : [];
        const newEntry = {
          idMeal:       m.id,
          strMeal:      m.name,
          strMealThumb: m.thumbnail,
          viewedAt:     Date.now(),
        };
        // Prepend and dedupe
        histList = [
          newEntry,
          ...histList.filter((h: any) => h.idMeal !== m.id),
        ];
        if (histList.length > MAX_HISTORY) {
          histList = histList.slice(0, MAX_HISTORY);
        }
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(histList));

        setLoadingLocal(false);
        // Skip remote fetch entirely
        return;
      }

      // If not local, fetch remote
      try {
        const data = await getMealDetails(id);
        setDish(data);

        // Favorite check for remote
        const favJson = await AsyncStorage.getItem(FAVORITES_KEY);
        const favList = favJson ? JSON.parse(favJson) : [];
        setIsFavorite(favList.some((f: any) => f.idMeal === data.idMeal));

        // Record remote to history
        const histJson = await AsyncStorage.getItem(HISTORY_KEY);
        let histList = histJson ? JSON.parse(histJson) : [];
        const newEntry = {
          idMeal:       data.idMeal,
          strMeal:      data.strMeal,
          strMealThumb: data.strMealThumb,
          viewedAt:     Date.now(),
        };
        histList = [
          newEntry,
          ...histList.filter((h: any) => h.idMeal !== data.idMeal),
        ];
        if (histList.length > MAX_HISTORY) {
          histList = histList.slice(0, MAX_HISTORY);
        }
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(histList));
      } catch (e) {
        console.error('Error fetching dish:', e);
      } finally {
        setLoadingDish(false);
      }
    })();
  }, [id]);

  // Toggle favorite (works for both local and remote)
  const toggleFavorite = async () => {
    const json = await AsyncStorage.getItem(FAVORITES_KEY);
    let list   = json ? JSON.parse(json) : [];
    if (isFavorite) {
      list = list.filter((f: any) => f.idMeal !== dish.idMeal);
    } else {
      list.push({
        idMeal:       dish.idMeal,
        strMeal:      dish.strMeal,
        strMealThumb: dish.strMealThumb,
      });
    }
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
    setIsFavorite(!isFavorite);
  };

  // 2️⃣ If remote dish, parse ingredients + fetch nutrition/allergens
  useEffect(() => {
    if (!dish || localMeal) return;
    (async () => {
      const list: { name: string; measure: string }[] = [];
      for (let i = 1; i <= 20; i++) {
        const name    = dish[`strIngredient${i}`]?.trim();
        const measure = dish[`strMeasure${i}`]?.trim();
        if (name) list.push({ name, measure });
      }
      const enriched = await Promise.all(
        list.map(async ({ name, measure }) => {
          try {
            const nut  = await getNutritionByIngredient(name);
            const aler = await getAllergenFlags(name);
            return { name, measure, nutrition: nut, allergens: aler };
          } catch {
            return {
              name,
              measure,
              nutrition: { calories:0, protein:0, fat:0, sugars:0, sodium:0 },
              allergens: [],
            };
          }
        })
      );
      setIngredients(enriched);
      setLoadingNut(false);
    })();
  }, [dish, localMeal]);

  // Show loader until either local or remote data is ready
  if ((localMeal && loadingLocal) || (!localMeal && loadingDish)) {
    return (
      <View style={[styles.loader, isDarkMode && styles.darkBg]}>
        <ActivityIndicator size="large" color={isDarkMode ? '#FFF' : '#000'} />
      </View>
    );
  }

  // If local meal found, render its details
  if (localMeal) {
    return (
      <SafeAreaView style={[styles.container, isDarkMode && styles.darkBg]}>
        <ScrollView>
          <Image source={localMeal.thumbnail} style={styles.image} />

          {/* Back Button */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="white" />
          </TouchableOpacity>

          {/* Favorite Button */}
          <TouchableOpacity style={styles.favoriteButton} onPress={toggleFavorite}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={24}
              color="white"
            />
          </TouchableOpacity>

          <View style={[styles.overlay, { backgroundColor: isDarkMode ? '#000' : '#FFF' }]}>
            <Text style={[styles.title, isDarkMode && styles.textDark]}>
              {localMeal.name}
            </Text>
            <Text style={[styles.description, { color: isDarkMode ? '#CCC' : '#555' }]}>
              {localMeal.instructions}
            </Text>

            <Text style={[styles.subheader, isDarkMode && styles.textDark]}>Category</Text>
            <Text style={[styles.textItem, isDarkMode && styles.textDark]}>
              {localMeal.category}
            </Text>

            <Text style={[styles.subheader, isDarkMode && styles.textDark]}>Ingredients</Text>
            {localMeal.ingredients.map((ing, idx) => (
              <Text key={idx} style={[styles.textItem, isDarkMode && styles.textDark]}>
                • {ing}
              </Text>
            ))}

            <Text style={[styles.subheader, isDarkMode && styles.textDark]}>Nutrition</Text>
            <Text style={[styles.textItem, isDarkMode && styles.textDark]}>
              Calories: {localMeal.nutrition.calories}
            </Text>
            <Text style={[styles.textItem, isDarkMode && styles.textDark]}>
              Protein: {localMeal.nutrition.protein} g
            </Text>
            <Text style={[styles.textItem, isDarkMode && styles.textDark]}>
              Fat: {localMeal.nutrition.fat} g
            </Text>
            <Text style={[styles.textItem, isDarkMode && styles.textDark]}>
              Carbs: {localMeal.nutrition.carbs} g
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Otherwise render remote-fetched dish
  return (
    <SafeAreaView style={[styles.container, isDarkMode && styles.darkBg]}>
      <ScrollView>
        <Image source={{ uri: dish.strMealThumb }} style={styles.image} />

        {/* Back Button */}
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>

        {/* Favorite Button */}
        <TouchableOpacity style={styles.favoriteButton} onPress={toggleFavorite}>
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={24}
            color="white"
          />
        </TouchableOpacity>

        <View style={[styles.overlay, { backgroundColor: isDarkMode ? '#000' : '#FFF' }]}>
          <Text style={[styles.title, isDarkMode && styles.textDark]}>{dish.strMeal}</Text>
          <Text style={[styles.description, { color: isDarkMode ? '#CCC' : '#555' }]}>
            {dish.strInstructions}
          </Text>

          <Text style={[styles.subheader, { color: isDarkMode ? '#FFF' : '#000' }]}>
            Ingredients & Nutrition
          </Text>

          {loadingNutrition ? (
            <ActivityIndicator size="small" color={isDarkMode ? '#FFF' : '#000'} />
          ) : ingredients.length > 0 ? (
            ingredients.map((ing, idx) => (
              <View key={idx} style={styles.row}>
                <View style={styles.leftCol}>
                  <Text style={[styles.ingName, { color: isDarkMode ? '#FFF' : '#000' }]}>
                    {ing.name}
                  </Text>
                  <Text style={[styles.ingMeasure, { color: isDarkMode ? '#CCC' : '#555' }]}>
                    {ing.measure}
                  </Text>
                </View>
                <View style={styles.centerCol}>
                  <Text style={styles.nutText}>Cal: {ing.nutrition.calories}</Text>
                  <Text style={styles.nutText}>Prot: {ing.nutrition.protein}</Text>
                  <Text style={styles.nutText}>Fat: {ing.nutrition.fat}</Text>
                  <Text style={styles.nutText}>Sugars: {ing.nutrition.sugars}</Text>
                  <Text style={styles.nutText}>Na: {ing.nutrition.sodium}</Text>
                </View>
                <View style={styles.rightCol}>
                  {ing.allergens.map((a, i) => (
                    <Text key={i} style={styles.allergen}>
                      {a.replace('en:', '')}
                    </Text>
                  ))}
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: isDarkMode ? '#FFF' : '#000' }]}>
              No ingredient data
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#FFF' },
  darkBg:          { backgroundColor: '#000' },
  loader:          { flex: 1, justifyContent: 'center', alignItems: 'center' },

  image:           { width: '100%', height: 250, resizeMode: 'cover' },
  backButton:      {
    position:          'absolute',
    top:               40,
    left:              20,
    backgroundColor:   'rgba(0,0,0,0.5)',
    padding:           8,
    borderRadius:      20,
  },
  favoriteButton:  {
    position:          'absolute',
    top:               40,
    right:             20,
    backgroundColor:   'rgba(0,0,0,0.5)',
    padding:           8,
    borderRadius:      20,
  },

  overlay:         {
    padding:           16,
    marginTop:        -20,
    borderTopLeftRadius: 20,
    borderTopRightRadius:20,
  },
  title:           { fontSize: 28, fontWeight: 'bold', color: '#D4A857' },
  textDark:        { color: '#FFF' },
  description:     { fontSize: 16, marginVertical: 12 },
  subheader:       { fontSize: 20, fontWeight: 'bold', marginTop: 16 },
  textItem:        { fontSize: 16, marginBottom: 8, color: '#000' },  // Added textItem style

  row:             {
    flexDirection:   'row',
    marginVertical:  8,
    paddingVertical: 8,
    borderBottomWidth:1,
    borderColor:     '#444',
  },
  leftCol:         { flex: 2 },
  centerCol:       { flex: 3, alignItems: 'flex-start' },
  rightCol:        { flex: 2, alignItems: 'flex-end' },

  ingName:         { fontSize: 16, fontWeight: '600' },
  ingMeasure:      { fontSize: 12 },

  nutText:         { fontSize: 12, color: '#D4A857' },

  allergen:        { fontSize: 10, color: '#E63946', fontWeight: 'bold' },

  emptyText:       { fontSize: 16, marginTop: 20, textAlign: 'center' },
  
});
