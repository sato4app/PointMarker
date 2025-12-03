/**
 * マーカーサイズ設定マネージャー
 * 各マーカーのサイズ設定を管理し、localStorageに保存
 */
export class MarkerSettingsManager {
    constructor() {
        // デフォルトのマーカーサイズ
        this.defaultSizes = {
            point: 6,
            selectedWaypoint: 6,
            unselectedWaypoint: 4,
            spot: 12
        };

        // 現在のマーカーサイズ
        this.currentSizes = { ...this.defaultSizes };

        // DOM要素
        this.dialog = null;
        this.overlay = null;
        this.inputs = {};

        // コールバック
        this.onSettingsChange = null;

        // localStorageキー
        this.storageKey = 'pointMarkerSettings';

        this.init();
    }

    /**
     * 初期化
     */
    init() {
        // DOM要素の取得
        this.dialog = document.getElementById('markerSettingsDialog');
        this.overlay = this.dialog;

        if (!this.dialog) {
            console.error('MarkerSettingsManager: markerSettingsDialog 要素が見つかりません');
            return;
        }

        this.inputs = {
            point: document.getElementById('pointSizeInput'),
            selectedWaypoint: document.getElementById('selectedWaypointSizeInput'),
            unselectedWaypoint: document.getElementById('unselectedWaypointSizeInput'),
            spot: document.getElementById('spotSizeInput')
        };

        // ボタン要素の取得
        this.okBtn = document.getElementById('settingsOkBtn');
        this.cancelBtn = document.getElementById('settingsCancelBtn');
        this.resetBtn = document.getElementById('settingsResetBtn');

        if (!this.okBtn || !this.cancelBtn || !this.resetBtn) {
            console.error('MarkerSettingsManager: ボタン要素が見つかりません');
            return;
        }

        console.log('MarkerSettingsManager: 初期化完了');

        // イベントリスナーの設定
        this.setupEventListeners();

        // localStorageから設定を読み込み
        this.loadSettings();
    }

    /**
     * イベントリスナーの設定
     */
    setupEventListeners() {
        // OKボタン
        this.okBtn.addEventListener('click', () => {
            this.applySettings();
        });

        // キャンセルボタン
        this.cancelBtn.addEventListener('click', () => {
            this.closeDialog();
        });

        // 初期値に戻すボタン
        this.resetBtn.addEventListener('click', () => {
            this.resetToDefaultAndApply();
        });

        // オーバーレイクリックで閉じる
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.closeDialog();
            }
        });

        // Escapeキーで閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dialog.style.display !== 'none') {
                this.closeDialog();
            }
        });
    }

    /**
     * ダイアログを開く
     */
    openDialog() {
        console.log('MarkerSettingsManager: openDialog() が呼ばれました');
        console.log('MarkerSettingsManager: this.dialog =', this.dialog);
        console.log('MarkerSettingsManager: currentSizes =', this.currentSizes);

        if (!this.dialog) {
            console.error('MarkerSettingsManager: ダイアログ要素が存在しません');
            return;
        }

        // 現在の設定値を入力フィールドに反映
        this.inputs.point.value = this.currentSizes.point;
        this.inputs.selectedWaypoint.value = this.currentSizes.selectedWaypoint;
        this.inputs.unselectedWaypoint.value = this.currentSizes.unselectedWaypoint;
        this.inputs.spot.value = this.currentSizes.spot;

        // ダイアログを表示
        this.dialog.style.display = 'flex';
        console.log('MarkerSettingsManager: ダイアログの display を flex に設定しました');
    }

    /**
     * ダイアログを閉じる
     */
    closeDialog() {
        this.dialog.style.display = 'none';
    }

    /**
     * 設定を適用
     */
    applySettings() {
        // 入力値を取得
        const newSizes = {
            point: parseInt(this.inputs.point.value, 10),
            selectedWaypoint: parseInt(this.inputs.selectedWaypoint.value, 10),
            unselectedWaypoint: parseInt(this.inputs.unselectedWaypoint.value, 10),
            spot: parseInt(this.inputs.spot.value, 10)
        };

        // バリデーション
        if (!this.validateSizes(newSizes)) {
            alert('入力値が範囲外です。正しい値を入力してください。');
            return;
        }

        // 現在のサイズを更新
        this.currentSizes = newSizes;

        // localStorageに保存
        this.saveSettings();

        // コールバックを実行
        if (this.onSettingsChange) {
            this.onSettingsChange(this.currentSizes);
        }

        // ダイアログを閉じる
        this.closeDialog();

        console.log('マーカーサイズ設定を適用しました:', this.currentSizes);
    }

    /**
     * サイズのバリデーション
     */
    validateSizes(sizes) {
        // ポイント: 2-20px
        if (sizes.point < 2 || sizes.point > 20) return false;

        // 選択ルート中間点: 2-20px
        if (sizes.selectedWaypoint < 2 || sizes.selectedWaypoint > 20) return false;

        // 非選択ルート中間点: 2-20px
        if (sizes.unselectedWaypoint < 2 || sizes.unselectedWaypoint > 20) return false;

        // スポット: 4-30px
        if (sizes.spot < 4 || sizes.spot > 30) return false;

        return true;
    }

    /**
     * localStorageに設定を保存
     */
    saveSettings() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.currentSizes));
            console.log('マーカーサイズ設定をlocalStorageに保存しました');
        } catch (error) {
            console.error('localStorageへの保存に失敗しました:', error);
        }
    }

    /**
     * localStorageから設定を読み込み
     */
    loadSettings() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);

                // バリデーション
                if (this.validateSizes(parsed)) {
                    this.currentSizes = parsed;
                    console.log('localStorageからマーカーサイズ設定を読み込みました:', this.currentSizes);
                } else {
                    console.warn('保存されたマーカーサイズ設定が無効です。デフォルト値を使用します。');
                }
            }
        } catch (error) {
            console.error('localStorageからの読み込みに失敗しました:', error);
        }
    }

    /**
     * 現在のマーカーサイズを取得
     */
    getSizes() {
        return { ...this.currentSizes };
    }

    /**
     * 設定変更時のコールバックを設定
     */
    setCallback(callback) {
        this.onSettingsChange = callback;
    }

    /**
     * 設定をリセット
     */
    resetToDefault() {
        this.currentSizes = { ...this.defaultSizes };
        this.saveSettings();

        if (this.onSettingsChange) {
            this.onSettingsChange(this.currentSizes);
        }

        console.log('マーカーサイズ設定をデフォルトにリセットしました');
    }

    /**
     * 初期値に戻して適用
     */
    resetToDefaultAndApply() {
        // 確認ダイアログを表示
        const confirmed = confirm('マーカーサイズを初期値に戻しますか？');
        if (!confirmed) {
            return;
        }

        // デフォルト値を入力フィールドに反映
        this.inputs.point.value = this.defaultSizes.point;
        this.inputs.selectedWaypoint.value = this.defaultSizes.selectedWaypoint;
        this.inputs.unselectedWaypoint.value = this.defaultSizes.unselectedWaypoint;
        this.inputs.spot.value = this.defaultSizes.spot;

        // 現在のサイズをデフォルトに更新
        this.currentSizes = { ...this.defaultSizes };

        // localStorageに保存
        this.saveSettings();

        // コールバックを実行
        if (this.onSettingsChange) {
            this.onSettingsChange(this.currentSizes);
        }

        // ダイアログを閉じる
        this.closeDialog();

        console.log('マーカーサイズを初期値に戻しました:', this.currentSizes);
    }
}
