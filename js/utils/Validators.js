/**
 * バリデーション機能を提供するクラス
 */
export class Validators {
    /**
     * ポイントIDが「X-nn」形式（英大文字1桁-数字2桁）かどうかをチェック
     * @param {string} value - 検証する値
     * @returns {boolean} 有効な形式かどうか
     */
    static isValidPointIdFormat(value) {
        if (!value || value.trim() === '') {
            return true;
        }
        
        const validPattern = /^[A-Z]-\d{2}$/;
        return validPattern.test(value);
    }

    /**
     * ポイントIDを「X-nn」形式に自動修正する
     * @param {string} value - 修正する値
     * @returns {string} 修正された値
     */
    static formatPointId(value) {
        if (!value || value.trim() === '') {
            return value;
        }
        
        let convertedValue = this.convertFullWidthToHalfWidth(value);
        
        const match1 = convertedValue.match(/^([A-Za-z])[-]?(\d{1,2})$/);
        if (match1) {
            const letter = match1[1].toUpperCase();
            const numbers = match1[2].padStart(2, '0');
            return `${letter}-${numbers}`;
        }
        
        if (convertedValue.match(/^\d+$/)) {
            return convertedValue;
        }
        
        return convertedValue;
    }

    /**
     * 全角英文字と全角数字、全角ハイフンを半角に変換する
     * @param {string} str - 変換する文字列
     * @returns {string} 変換後の文字列
     */
    static convertFullWidthToHalfWidth(str) {
        return str.replace(/[Ａ-Ｚａ-ｚ０-９－−‐―]/g, function(char) {
            if (char >= 'Ａ' && char <= 'Ｚ') {
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            if (char >= 'ａ' && char <= 'ｚ') {
                const halfWidthChar = String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
                return halfWidthChar.toUpperCase();
            }
            if (char >= '０' && char <= '９') {
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            if (char === '－' || char === '−' || char === '‐' || char === '―') {
                return '-';
            }
            return char;
        });
    }

    /**
     * ファイルがPNG形式かどうかをチェック
     * @param {File} file - チェックするファイル
     * @returns {boolean} PNG形式かどうか
     */
    static isPngFile(file) {
        return file && file.type.includes('png');
    }

    /**
     * ファイルがJSON形式かどうかをチェック
     * @param {File} file - チェックするファイル
     * @returns {boolean} JSON形式かどうか
     */
    static isJsonFile(file) {
        return file && file.type.includes('json');
    }

    /**
     * JSONデータがポイント形式として有効かどうかをチェック
     * @param {Object} data - チェックするJSONデータ
     * @returns {boolean} 有効なポイントデータかどうか
     */
    static isValidPointData(data) {
        return data && data.points && Array.isArray(data.points);
    }

    /**
     * JSONデータがルート形式として有効かどうかをチェック
     * @param {Object} data - チェックするJSONデータ
     * @returns {boolean} 有効なルートデータかどうか
     */
    static isValidRouteData(data) {
        return data && data.points && Array.isArray(data.points) && data.routeInfo;
    }
}