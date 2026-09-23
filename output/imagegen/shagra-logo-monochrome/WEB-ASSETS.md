# Логотипы сайта

- `frontend/public/brand/logo-light.png`: чёрный знак для светлой темы.
- `frontend/public/brand/logo-dark.png`: белый знак для тёмной темы.

Отдельные PNG подготовлены встроенным image_gen из согласованного `light-and-dark.png`. Файлы имеют непрозрачный фон. Компонент `BrandMark` выбирает файл по теме сайта; CSS `multiply`/`screen` убирает фон при отображении на поверхностях интерфейса. Форма состоит из трёх ступеней, без текста и цветного акцента.

## Промпты

### black

Extract the LEFT logo from the supplied two-panel image into its own separate square image. Preserve EXACT approved silhouette and proportions of all three separate black stair shapes. Crop closely so the symbol occupies 88 percent of image width and is centered vertically. Pure black symbol, fully opaque pure white background. Keep the white background intentionally: DO NOT use transparency or remove background. No second logo, no borders, no text, no extra shapes. Clean flat fill, sharp smooth curves and straight edges, no outlines, no gradients, no shadows, no texture.

### white

Extract the RIGHT logo from the supplied two-panel image into its own separate square image. Preserve EXACT approved silhouette and proportions of all three separate white stair shapes. Crop closely so the symbol occupies 88 percent of image width and is centered vertically. Pure white symbol, fully opaque pure black background. Keep the black background intentionally: DO NOT use transparency or remove background. No second logo, no borders, no text, no extra shapes. Clean flat fill, sharp smooth curves and straight edges, no outlines, no gradients, no shadows, no texture.
