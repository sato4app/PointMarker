import { Validators } from '../utils/Validators.js';

/**
 * ファイル操作を管理するクラス
 */
export class FileHandler {
    constructor() {
        this.currentImageFileHandle = null;
        this.currentImageFileName = '';
    }

    /**
     * 画像ファイルを選択・読み込み
     * @returns {Promise<{file: File, image: HTMLImageElement, fileName: string}>} 読み込み結果
     */
    async selectImage() {
        try {
            if ('showOpenFilePicker' in window) {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'PNG Files',
                        accept: {
                            'image/png': ['.png']
                        }
                    }],
                    multiple: false
                });
                
                this.currentImageFileHandle = fileHandle;
                const file = await fileHandle.getFile();
                
                if (!Validators.isPngFile(file)) {
                    throw new Error('PNG画像ファイルを選択してください');
                }
                
                this.currentImageFileName = file.name.replace(/\.png$/i, '');
                const image = await this.loadImageFromFile(file);
                
                return { file, image, fileName: this.currentImageFileName };
            } else {
                throw new Error('File System Access API not supported');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('ファイル選択がキャンセルされました');
            }
            throw error;
        }
    }

    /**
     * 従来のinput要素からファイルを読み込み
     * @param {File} file - ファイルオブジェクト
     * @returns {Promise<{file: File, image: HTMLImageElement, fileName: string}>} 読み込み結果
     */
    async loadFromInputFile(file) {
        if (!Validators.isPngFile(file)) {
            throw new Error('PNG画像ファイルを選択してください');
        }
        
        this.currentImageFileName = file.name.replace(/\.png$/i, '');
        const image = await this.loadImageFromFile(file);
        
        return { file, image, fileName: this.currentImageFileName };
    }

    /**
     * ファイルオブジェクトから画像を読み込み
     * @param {File} file - ファイルオブジェクト
     * @returns {Promise<HTMLImageElement>} 読み込まれた画像
     */
    async loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * JSONファイルを読み込み・パース
     * @param {File} file - JSONファイル
     * @returns {Promise<Object>} パース済みJSONデータ
     */
    async loadJsonFile(file) {
        if (!Validators.isJsonFile(file)) {
            throw new Error('JSONファイルを選択してください');
        }
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const jsonData = JSON.parse(e.target.result);
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error('JSONファイルの形式が正しくありません'));
                }
            };
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsText(file);
        });
    }

    /**
     * JSONデータをファイルとしてダウンロード
     * @param {Object} data - JSON data
     * @param {string} filename - ファイル名
     */
    downloadJSON(data, filename) {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * ユーザーが場所を指定してJSONファイルを保存
     * @param {Object} data - JSON data
     * @param {string} defaultFilename - デフォルトファイル名
     * @returns {Promise<void>}
     */
    async saveJSONWithUserChoice(data, defaultFilename) {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        try {
            if ('showSaveFilePicker' in window) {
                let savePickerOptions = {
                    suggestedName: defaultFilename,
                    types: [{
                        description: 'JSON Files',
                        accept: {
                            'application/json': ['.json']
                        }
                    }]
                };
                
                if (this.currentImageFileHandle) {
                    try {
                        const parentDirectoryHandle = await this.currentImageFileHandle.getParent();
                        savePickerOptions.startIn = parentDirectoryHandle;
                    } catch (error) {
                        console.log('同じディレクトリの取得に失敗、デフォルトディレクトリを使用');
                    }
                }
                
                const fileHandle = await window.showSaveFilePicker(savePickerOptions);
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                console.log(`JSONファイルが保存されました: ${fileHandle.name}`);
            } else {
                this.downloadJSON(data, defaultFilename);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('ファイル保存がキャンセルされました');
                return;
            }
            
            console.error('ファイル保存エラー:', error);
            this.downloadJSON(data, defaultFilename);
        }
    }

    /**
     * 現在の画像ファイル名を取得
     * @returns {string} ファイル名
     */
    getCurrentImageFileName() {
        return this.currentImageFileName;
    }
}