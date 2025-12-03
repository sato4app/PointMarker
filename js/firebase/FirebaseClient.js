/**
 * FirebaseClient.js
 * Firebase初期化とFirestore接続を管理するクラス
 */

export class FirebaseClient {
    constructor(config) {
        this.config = config;
        this.app = null;
        this.db = null;
        this.initialized = false;
    }

    /**
     * Firebaseを初期化
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            console.warn('Firebase is already initialized');
            return;
        }

        try {
            // Firebase アプリの初期化
            this.app = firebase.initializeApp(this.config);

            // Firestore インスタンスの取得
            this.db = firebase.firestore();

            // Firestore設定（オフライン永続化）
            // 永続化は任意機能のため、失敗してもアプリは動作する
            try {
                await this.db.enablePersistence({synchronizeTabs: true});
                console.log('Firestore永続化が有効化されました');
            } catch (err) {
                if (err.code === 'failed-precondition') {
                    console.warn('Firestore永続化: 複数のタブが開いているため有効化できません（メモリキャッシュで動作）');
                } else if (err.code === 'unimplemented') {
                    console.warn('Firestore永続化: このブラウザはサポートしていません（メモリキャッシュで動作）');
                } else {
                    // 古いバージョンのデータが残っている場合など
                    console.warn('Firestore永続化エラー（メモリキャッシュで動作）:', err.message);
                }
            }

            this.initialized = true;
        } catch (error) {
            console.error('Firebase initialization failed:', error);
            throw new Error('Firebaseの初期化に失敗しました: ' + error.message);
        }
    }

    /**
     * Firestoreインスタンスを取得
     * @returns {firebase.firestore.Firestore}
     */
    getFirestore() {
        if (!this.initialized) {
            throw new Error('Firebase is not initialized. Call initialize() first.');
        }
        return this.db;
    }

    /**
     * Firebase Appインスタンスを取得
     * @returns {firebase.app.App}
     */
    getApp() {
        if (!this.initialized) {
            throw new Error('Firebase is not initialized. Call initialize() first.');
        }
        return this.app;
    }

    /**
     * 初期化状態を確認
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Firebaseタイムスタンプを取得
     * @returns {firebase.firestore.FieldValue}
     */
    getServerTimestamp() {
        return firebase.firestore.FieldValue.serverTimestamp();
    }

    /**
     * 配列要素を追加するFieldValueを取得
     * @param {*} element - 追加する要素
     * @returns {firebase.firestore.FieldValue}
     */
    arrayUnion(element) {
        return firebase.firestore.FieldValue.arrayUnion(element);
    }

    /**
     * 配列要素を削除するFieldValueを取得
     * @param {*} element - 削除する要素
     * @returns {firebase.firestore.FieldValue}
     */
    arrayRemove(element) {
        return firebase.firestore.FieldValue.arrayRemove(element);
    }
}
