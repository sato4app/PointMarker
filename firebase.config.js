// Firebase設定情報
// ⚠️ このファイルは .gitignore に追加してください
// ⚠️ YOUR_XXX の部分を実際のFirebase設定情報に置き換えてください

// Firebase設定の取得方法:
// 1. https://console.firebase.google.com/ にアクセス
// 2. プロジェクトを選択
// 3. プロジェクトの設定 → マイアプリ → SDK の設定と構成
// 4. 構成をコピーして上記の値を置き換え

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCkxC9tELkUow1MV98HoDoJwrKGy9SoT-M",
  authDomain: "pointmarker-sato.firebaseapp.com",
  projectId: "pointmarker-sato",
  storageBucket: "pointmarker-sato.firebasestorage.app",
  messagingSenderId: "506735557098",
  appId: "1:506735557098:web:f00d29462dbc5abaab5a93"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
