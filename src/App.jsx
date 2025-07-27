import { useState, useRef, useCallback, useEffect } from 'react'
import './App.css'

// Утилиты для пикселизации
const pixelizeImage = (imageData, targetWidth, targetHeight) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // Отрисовываем изображение в меньшем размере
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(imageData, 0, 0, targetWidth, targetHeight);

  // Получаем пиксельные данные
  const pixelData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  return pixelData;
};



// Функция для подсчета уникальных цветов
const countUniqueColors = (pixelData) => {
  const { data, width, height } = pixelData;
  const colors = new Set();

  for (let i = 0; i < width * height; i++) {
    const index = i * 4;
    const color = `${data[index]},${data[index + 1]},${data[index + 2]}`;
    colors.add(color);
  }

  return colors.size;
};

// Функция применения контраста
const applyContrast = (pixelData, contrast) => {
  const newData = new Uint8ClampedArray(pixelData.data);

  for (let i = 0; i < newData.length; i += 4) {
    // Применяем контраст к RGB каналам
    newData[i] = Math.min(255, Math.max(0, ((newData[i] - 128) * contrast) + 128));
    newData[i + 1] = Math.min(255, Math.max(0, ((newData[i + 1] - 128) * contrast) + 128));
    newData[i + 2] = Math.min(255, Math.max(0, ((newData[i + 2] - 128) * contrast) + 128));
    // Альфа канал остается без изменений
  }

  return new ImageData(newData, pixelData.width, pixelData.height);
};

// Функция квантизации цветов (упрощенный алгоритм)
const quantizeColors = (pixelData, targetColors) => {
  const { data, width, height } = pixelData;
  const newData = new Uint8ClampedArray(data);

  // Простая квантизация через равномерное разделение RGB пространства
  const levels = Math.round(Math.pow(targetColors, 1 / 3)); // Кубический корень для равномерного распределения по RGB
  const step = 255 / (levels - 1);

  for (let i = 0; i < newData.length; i += 4) {
    // Квантизируем каждый цветовой канал
    newData[i] = Math.round(newData[i] / step) * step;     // R
    newData[i + 1] = Math.round(newData[i + 1] / step) * step; // G
    newData[i + 2] = Math.round(newData[i + 2] / step) * step; // B
    // Альфа канал остается без изменений
  }

  return new ImageData(newData, width, height);
};

// Функция для подсчета всех цветов в изображении
const getColorStats = (pixelData) => {
  const { data, width, height } = pixelData;
  const colorCounts = {};

  for (let i = 0; i < width * height; i++) {
    const index = i * 4;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

    colorCounts[color] = (colorCounts[color] || 0) + 1;
  }

  // Сортируем по количеству использований (от большего к меньшему)
  return Object.entries(colorCounts)
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count);
};

// Функция применения переназначений цветов
const applyColorMapping = (pixelData, colorMapping) => {
  if (!colorMapping || Object.keys(colorMapping).length === 0) {
    return pixelData;
  }

  const { data, width, height } = pixelData;
  const newData = new Uint8ClampedArray(data);

  for (let i = 0; i < newData.length; i += 4) {
    const r = newData[i];
    const g = newData[i + 1];
    const b = newData[i + 2];
    const currentColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

    if (colorMapping[currentColor]) {
      const newColor = colorMapping[currentColor];
      // Конвертируем hex в RGB
      const newR = parseInt(newColor.substr(1, 2), 16);
      const newG = parseInt(newColor.substr(3, 2), 16);
      const newB = parseInt(newColor.substr(5, 2), 16);

      newData[i] = newR;
      newData[i + 1] = newG;
      newData[i + 2] = newB;
    }
  }

  return new ImageData(newData, width, height);
};

// Компонент для палитры цветов
const ColorPalette = ({ colors, colorMapping, onColorMapping, onApplyEffects }) => {
  const [editingColor, setEditingColor] = useState(null);
  const [newColor, setNewColor] = useState('');

  const handleColorChange = (originalColor, targetColor) => {
    const newMapping = { ...colorMapping };
    if (targetColor && targetColor !== originalColor) {
      newMapping[originalColor] = targetColor;
    } else {
      delete newMapping[originalColor];
    }

    // Сохраняем в localStorage
    localStorage.setItem('pixelator-color-mapping', JSON.stringify(newMapping));
    onColorMapping(newMapping);
  };

  const startEditing = (color) => {
    setEditingColor(color);
    setNewColor(colorMapping[color] || color);
  };

  const finishEditing = () => {
    if (editingColor) {
      handleColorChange(editingColor, newColor);
    }
    setEditingColor(null);
    setNewColor('');
    onApplyEffects();
  };

  const cancelEditing = () => {
    setEditingColor(null);
    setNewColor('');
  };

  const clearMapping = (color) => {
    handleColorChange(color, '');
  };

  if (!colors || colors.length === 0) return null;

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          Палитра цветов ({colors.length} цветов)
        </h3>
        <div className="text-sm text-gray-600">
          Всего пикселей: {colors.reduce((sum, c) => sum + c.count, 0)}
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto border rounded-lg">
        <div className="space-y-2 p-4">
          {colors.map(({ color, count }) => {
            const mappedColor = colorMapping[color];
            const isEditing = editingColor === color;

            return (
              <div key={color} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                {/* Оригинальный цвет */}
                <div className="flex items-center gap-2 flex-1">
                  <div
                    className="w-8 h-8 rounded border-2 border-gray-300 flex-shrink-0"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                  <div className="text-sm">
                    <div className="font-mono text-gray-700">{color}</div>
                    <div className="text-gray-500">{count} пикс.</div>
                  </div>
                </div>

                {/* Стрелка и назначенный цвет */}
                {(mappedColor || isEditing) && (
                  <>
                    <div className="text-gray-400">→</div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={newColor}
                            onChange={(e) => setNewColor(e.target.value)}
                            className="w-8 h-8 rounded border-2 border-gray-300"
                          />
                          <input
                            type="text"
                            value={newColor}
                            onChange={(e) => setNewColor(e.target.value)}
                            className="w-20 px-2 py-1 text-xs font-mono border rounded"
                            placeholder="#000000"
                          />
                          <button
                            onClick={finishEditing}
                            className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                          >
                            ✓
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <div
                            className="w-8 h-8 rounded border-2 border-gray-300 flex-shrink-0"
                            style={{ backgroundColor: mappedColor }}
                            title={mappedColor}
                          />
                          <div className="text-sm font-mono text-gray-700">{mappedColor}</div>
                        </>
                      )}
                    </div>
                  </>
                )}

                {/* Кнопки управления */}
                <div className="flex gap-1">
                  {!isEditing && (
                    <>
                      <button
                        onClick={() => startEditing(color)}
                        className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                        title="Изменить цвет"
                      >
                        ✎
                      </button>
                      {mappedColor && (
                        <button
                          onClick={() => clearMapping(color)}
                          className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                          title="Убрать переназначение"
                        >
                          ✕
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {Object.keys(colorMapping).length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="text-sm text-blue-800">
            Активных переназначений: {Object.keys(colorMapping).length}
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('pixelator-color-mapping');
              onColorMapping({});
              onApplyEffects();
            }}
            className="mt-2 px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
          >
            Очистить все переназначения
          </button>
        </div>
      )}
    </div>
  );
};

// Компонент для отображения пиксельной сетки
const PixelGrid = ({ pixelData, gridSize, onExport }) => {
  const [hoveredPixel, setHoveredPixel] = useState({ x: -1, y: -1 });

  if (!pixelData) return null;

  const { data, width, height } = pixelData;
  const pixels = [];

  // Конвертируем данные в массив пикселей
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];

      pixels.push({
        x, y,
        color: `rgba(${r}, ${g}, ${b}, ${a / 255})`,
        rgb: { r, g, b, a }
      });
    }
  }

  const handleMouseEnter = (x, y) => {
    setHoveredPixel({ x, y });
  };

  const handleMouseLeave = () => {
    setHoveredPixel({ x: -1, y: -1 });
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          Пиксель-арт ({width} × {height})
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => onExport('png')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Скачать PNG
          </button>
          <button
            onClick={() => onExport('json')}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            title="Сохранить проект со всеми настройками"
          >
            Скачать проект (JSON)
          </button>
        </div>
      </div>

      <div
        className="relative inline-block border-2 border-gray-300"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${width}, ${gridSize}px)`,
          gridTemplateRows: `repeat(${height}, ${gridSize}px)`,
          gap: '0.5px',
          backgroundColor: '#e5e7eb'
        }}
      >
        {pixels.map((pixel, index) => (
          <div
            key={index}
            className={`relative border transition-all duration-100 ${hoveredPixel.x === pixel.x || hoveredPixel.y === pixel.y
              ? 'ring-2 ring-blue-400 z-10 scale-110'
              : 'border-gray-200'
              }`}
            style={{
              backgroundColor: pixel.color,
              width: `${gridSize}px`,
              height: `${gridSize}px`,
            }}
            onMouseEnter={() => handleMouseEnter(pixel.x, pixel.y)}
            onMouseLeave={handleMouseLeave}
            title={`x: ${pixel.x}, y: ${pixel.y}, цвет: ${pixel.color}`}
          />
        ))}

        {/* Подсветка строки и столбца */}
        {hoveredPixel.x >= 0 && (
          <>
            {/* Подсветка столбца */}
            <div
              className="absolute bg-blue-400 bg-opacity-20 pointer-events-none z-0"
              style={{
                left: `${hoveredPixel.x * (gridSize + 0.5)}px`,
                top: 0,
                width: `${gridSize}px`,
                height: '100%'
              }}
            />
            {/* Подсветка строки */}
            <div
              className="absolute bg-blue-400 bg-opacity-20 pointer-events-none z-0"
              style={{
                left: 0,
                top: `${hoveredPixel.y * (gridSize + 0.5)}px`,
                width: '100%',
                height: `${gridSize}px`
              }}
            />
          </>
        )}
      </div>

      {hoveredPixel.x >= 0 && (
        <div className="mt-4 p-3 bg-gray-100 rounded-lg">
          <p className="text-sm text-gray-600">
            Позиция: ({hoveredPixel.x + 1}, {hoveredPixel.y + 1})
          </p>
        </div>
      )}
    </div>
  );
};

function App() {
  const [originalImage, setOriginalImage] = useState(null);
  const [pixelData, setPixelData] = useState(null);
  const [originalPixelData, setOriginalPixelData] = useState(null); // Оригинальные данные без обработки
  const [dimensions, setDimensions] = useState({ width: 50, height: 50 });
  const [sizeMode, setSizeMode] = useState('height'); // 'width' или 'height'
  const [sizeValue, setSizeValue] = useState(50);
  const [isProcessing, setIsProcessing] = useState(false);
  const [colorCount, setColorCount] = useState(256);
  const [maxColors, setMaxColors] = useState(256);
  const [contrast, setContrast] = useState(1.0);
  const [colorMapping, setColorMapping] = useState(() => {
    // Загружаем сохраненные переназначения из localStorage
    const saved = localStorage.getItem('pixelator-color-mapping');
    return saved ? JSON.parse(saved) : {};
  });
  const [currentColors, setCurrentColors] = useState([]);

  const fileInputRef = useRef(null);

  // Функция для импорта JSON проекта
  const handleJSONImport = useCallback(async (file) => {
    try {
      const text = await file.text();
      const projectData = JSON.parse(text);

      // Проверяем, что это наш JSON проект
      if (!projectData.pixelatorProject || !projectData.pixels) {
        alert('Неверный формат JSON файла');
        return;
      }

      setIsProcessing(true);

      // Восстанавливаем настройки
      if (projectData.settings) {
        const { settings } = projectData;
        if (settings.sizeMode) setSizeMode(settings.sizeMode);
        if (settings.sizeValue) setSizeValue(settings.sizeValue);
        if (settings.colorCount) setColorCount(settings.colorCount);
        if (settings.maxColors) setMaxColors(settings.maxColors);
        if (settings.contrast) setContrast(settings.contrast);
        if (settings.dimensions) setDimensions(settings.dimensions);

        // Восстанавливаем переназначения цветов
        if (settings.colorMapping) {
          setColorMapping(settings.colorMapping);
          localStorage.setItem('pixelator-color-mapping', JSON.stringify(settings.colorMapping));
        }
      }

      // Создаем ImageData из пиксельных данных
      const { width, height, pixels } = projectData;
      const imageData = new ImageData(width, height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixel = pixels[y][x];
          const index = (y * width + x) * 4;
          imageData.data[index] = pixel.r;
          imageData.data[index + 1] = pixel.g;
          imageData.data[index + 2] = pixel.b;
          imageData.data[index + 3] = pixel.a;
        }
      }

      setOriginalPixelData(imageData);
      setOriginalImage({ isFromJSON: true, projectData });
      setIsProcessing(false);

    } catch (error) {
      console.error('Ошибка при загрузке JSON:', error);
      alert('Ошибка при загрузке JSON файла');
      setIsProcessing(false);
    }
  }, []);

  const handleFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Проверяем тип файла
    if (file.type === 'application/json') {
      // Загружаем JSON проект
      handleJSONImport(file);
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите файл изображения или JSON проект');
      return;
    }

    setIsProcessing(true);

    try {
      const img = new Image();
      img.onload = async () => {
        setOriginalImage({ img, file });

        // Вычисляем пропорциональные размеры
        const aspectRatio = img.width / img.height;
        let newWidth, newHeight;

        if (sizeMode === 'height') {
          newHeight = Math.min(sizeValue, 100);
          newWidth = Math.round(newHeight * aspectRatio);
        } else {
          newWidth = Math.min(sizeValue, 100);
          newHeight = Math.round(newWidth / aspectRatio);
        }

        setDimensions({ width: newWidth, height: newHeight });

        // Пикселизируем изображение
        const pixelizedData = pixelizeImage(img, newWidth, newHeight);
        setOriginalPixelData(pixelizedData);

        // Подсчитываем количество уникальных цветов
        const uniqueColors = countUniqueColors(pixelizedData);
        setMaxColors(uniqueColors);
        setColorCount(uniqueColors);

        setIsProcessing(false);
      };

      img.src = URL.createObjectURL(file);
    } catch (error) {
      console.error('Ошибка при обработке изображения:', error);
      setIsProcessing(false);
    }
  }, [sizeMode, sizeValue]);

  const handleSizeChange = useCallback(() => {
    if (!originalImage) return;

    setIsProcessing(true);

    // Для JSON проектов используем оригинальные пиксельные данные
    if (originalImage.isFromJSON) {
      // Для JSON проектов пересчитываем с новыми параметрами
      if (originalPixelData) {
        const uniqueColors = countUniqueColors(originalPixelData);
        setMaxColors(uniqueColors);
        setColorCount(Math.min(colorCount, uniqueColors));
      }
      setIsProcessing(false);
      return;
    }

    const { img } = originalImage;
    const aspectRatio = img.width / img.height;

    let newWidth, newHeight;

    if (sizeMode === 'height') {
      newHeight = Math.min(Math.max(sizeValue, 1), 100);
      newWidth = Math.round(newHeight * aspectRatio);
    } else {
      newWidth = Math.min(Math.max(sizeValue, 1), 100);
      newHeight = Math.round(newWidth / aspectRatio);
    }

    setDimensions({ width: newWidth, height: newHeight });

    const pixelizedData = pixelizeImage(img, newWidth, newHeight);
    setOriginalPixelData(pixelizedData);

    // Подсчитываем количество уникальных цветов
    const uniqueColors = countUniqueColors(pixelizedData);
    setMaxColors(uniqueColors);
    setColorCount(uniqueColors);

    setIsProcessing(false);
  }, [originalImage, sizeMode, sizeValue]);

  // Функция для применения эффектов (квантизация и контраст)
  const applyEffects = useCallback(() => {
    if (!originalPixelData) return;

    let processedData = originalPixelData;

    // Применяем контраст
    if (contrast !== 1.0) {
      processedData = applyContrast(processedData, contrast);
    }

    // Применяем квантизацию цветов
    if (colorCount < maxColors) {
      processedData = quantizeColors(processedData, colorCount);
    }

    // Применяем переназначения цветов
    processedData = applyColorMapping(processedData, colorMapping);

    // Обновляем статистику цветов
    const colorStats = getColorStats(processedData);
    setCurrentColors(colorStats);

    setPixelData(processedData);
  }, [originalPixelData, colorCount, maxColors, contrast, colorMapping]);

  // Автоматически применяем эффекты при изменении данных
  useEffect(() => {
    if (originalPixelData) {
      applyEffects();
    }
  }, [originalPixelData, applyEffects]);

  const handleExport = useCallback((format) => {
    if (!pixelData) return;

    if (format === 'png') {
      // Экспорт в PNG
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const scale = 10; // Увеличиваем масштаб для лучшего качества
      canvas.width = pixelData.width * scale;
      canvas.height = pixelData.height * scale;

      ctx.imageSmoothingEnabled = false;

      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = pixelData.width;
      tempCanvas.height = pixelData.height;
      tempCtx.putImageData(pixelData, 0, 0);

      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pixel-art.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    } else if (format === 'json') {
      // Экспорт в JSON со всеми настройками проекта
      const { data, width, height } = pixelData;
      const pixels = [];

      for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
          const index = (y * width + x) * 4;
          row.push({
            r: data[index],
            g: data[index + 1],
            b: data[index + 2],
            a: data[index + 3]
          });
        }
        pixels.push(row);
      }

      const exportData = {
        pixelatorProject: true,
        version: "1.0",
        width,
        height,
        pixels,
        settings: {
          sizeMode,
          sizeValue,
          colorCount,
          maxColors,
          contrast,
          dimensions,
          colorMapping
        },
        colorStats: currentColors,
        created: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pixelator-project.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [pixelData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Заголовок */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Пикселизатор</h1>
          <p className="text-gray-600">
            Превращайте фотографии в пиксель-арт для схем вышивки
          </p>
        </div>

        {/* Панель управления */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Загрузка файла */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Выберите изображение или JSON проект
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.json"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <div className="mt-1 text-xs text-gray-500">
                Поддерживаются изображения (PNG, JPG) и JSON проекты
              </div>
            </div>

            {/* Выбор размера */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ограничить по
              </label>
              <select
                value={sizeMode}
                onChange={(e) => setSizeMode(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="height">Высоте</option>
                <option value="width">Ширине</option>
              </select>
            </div>

            {/* Значение размера */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Максимум пикселей ({sizeMode === 'height' ? 'высота' : 'ширина'})
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={sizeValue}
                  onChange={(e) => setSizeValue(parseInt(e.target.value) || 1)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={handleSizeChange}
                  disabled={!originalImage || isProcessing}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Применить
                </button>
              </div>
            </div>
          </div>

          {/* Настройки цвета и контраста */}
          {originalPixelData && (
            <div className="border-t pt-6">
              <h4 className="text-md font-medium text-gray-700 mb-4">Настройки цвета</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Количество цветов */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Количество цветов: {colorCount} (из {maxColors})
                  </label>
                  <input
                    type="range"
                    min="2"
                    max={maxColors}
                    value={colorCount}
                    onChange={(e) => {
                      const newCount = parseInt(e.target.value);
                      setColorCount(newCount);
                      // Применяем эффекты с небольшой задержкой для плавности
                      setTimeout(() => applyEffects(), 100);
                    }}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Минимум</span>
                    <span>Максимум</span>
                  </div>
                </div>

                {/* Контраст */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Контраст: {contrast.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={contrast}
                    onChange={(e) => {
                      const newContrast = parseFloat(e.target.value);
                      setContrast(newContrast);
                      // Применяем эффекты с небольшой задержкой для плавности
                      setTimeout(() => applyEffects(), 100);
                    }}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Низкий</span>
                    <span>Высокий</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {dimensions.width > 0 && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              Итоговый размер: {dimensions.width} × {dimensions.height} пикселей
            </p>
          </div>
        )}
      </div>

      {/* Результат */}
      {isProcessing && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="mt-2 text-gray-600">Обработка изображения...</p>
        </div>
      )}

      {pixelData && !isProcessing && (
        <div className="space-y-8">
          {/* Пиксельная сетка */}
          <div className="w-full overflow-x-auto pb-4">
            <div
              className="flex px-4"
              style={{
                scrollPadding: '20px',
                justifyContent: (() => {
                  const gridSize = Math.max(10, Math.min(30, 400 / Math.max(dimensions.width, dimensions.height)));
                  const gridWidth = dimensions.width * gridSize + (dimensions.width - 1) * 0.5; // учитываем размер gap
                  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
                  return gridWidth > screenWidth - 100 ? 'flex-start' : 'center';
                })()
              }}
            >
              <PixelGrid
                pixelData={pixelData}
                gridSize={Math.max(10, Math.min(30, 400 / Math.max(dimensions.width, dimensions.height)))}
                onExport={handleExport}
              />
            </div>
          </div>

          {/* Палитра цветов */}
          <div>
            <ColorPalette
              colors={currentColors}
              colorMapping={colorMapping}
              onColorMapping={(newMapping) => {
                setColorMapping(newMapping);
                // Применяем эффекты заново после изменения переназначений
                setTimeout(() => applyEffects(), 100);
              }}
              onApplyEffects={applyEffects}
            />
          </div>
        </div>
      )}

      {!originalImage && !isProcessing && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-500">Загрузите изображение, чтобы начать работу</p>
        </div>
      )}
    </div>
  );
}

export default App;
