/**
 * Примеры использования хука useImagePreloader и компонента ImagePreloader
 * 
 * Эти примеры показывают, как использовать универсальный механизм
 * отслеживания загрузки изображений в различных сценариях.
 */

import { useImagePreloader } from "@/hooks/use-image-preloader";
import { ImagePreloader } from "@/components/image-preloader";

// ============================================
// Пример 1: Использование хука напрямую
// ============================================
export function CardWithHook() {
  const photoUrl = "/path/to/photo.jpg";
  const logoUrl = "/path/to/logo.png";

  const { isReady, imageRefs, setImageRef, handleImageLoad, handleImageError } = useImagePreloader({
    imageUrls: [photoUrl, logoUrl],
    onAllLoaded: () => {
      console.log("Все изображения загружены!");
    },
  });

  return (
    <div
      style={{
        opacity: isReady ? 1 : 0,
        transition: "opacity 0.2s ease-in-out",
      }}
    >
      <img
        ref={(el) => setImageRef(0, el)}
        src={photoUrl}
        onLoad={() => handleImageLoad(0)}
        onError={() => handleImageError(0)}
        alt="Photo"
      />
      <img
        ref={(el) => setImageRef(1, el)}
        src={logoUrl}
        onLoad={() => handleImageLoad(1)}
        onError={() => handleImageError(1)}
        alt="Logo"
      />
    </div>
  );
}

// ============================================
// Пример 2: Использование компонента-обертки
// ============================================
export function CardWithComponent() {
  const photoUrl = "/path/to/photo.jpg";
  const logoUrl = "/path/to/logo.png";

  return (
    <ImagePreloader
      imageUrls={[photoUrl, logoUrl]}
      transitionDuration={300}
      showPlaceholder={true}
      placeholderMinHeight={200}
    >
      <div>
        <img src={photoUrl} alt="Photo" />
        <img src={logoUrl} alt="Logo" />
      </div>
    </ImagePreloader>
  );
}

// ============================================
// Пример 3: Условные изображения
// ============================================
export function CardWithConditionalImages() {
  const photoUrl = "/path/to/photo.jpg";
  const logoUrl = null; // Может быть null
  const optionalImage = Math.random() > 0.5 ? "/path/to/optional.jpg" : null;

  const { isReady, imageRefs, setImageRef, handleImageLoad, handleImageError } = useImagePreloader({
    imageUrls: [photoUrl, logoUrl, optionalImage],
  });

  return (
    <div style={{ opacity: isReady ? 1 : 0 }}>
      <img
        ref={(el) => setImageRef(0, el)}
        src={photoUrl}
        onLoad={() => handleImageLoad(0)}
        onError={() => handleImageError(0)}
        alt="Photo"
      />
      {logoUrl && (
        <img
          ref={(el) => setImageRef(1, el)}
          src={logoUrl}
          onLoad={() => handleImageLoad(1)}
          onError={() => handleImageError(1)}
          alt="Logo"
        />
      )}
      {optionalImage && (
        <img
          ref={(el) => setImageRef(2, el)}
          src={optionalImage}
          onLoad={() => handleImageLoad(2)}
          onError={() => handleImageError(2)}
          alt="Optional"
        />
      )}
    </div>
  );
}

// ============================================
// Пример 4: С кастомным placeholder
// ============================================
export function CardWithCustomPlaceholder() {
  const photoUrl = "/path/to/photo.jpg";

  return (
    <ImagePreloader
      imageUrls={[photoUrl]}
      showPlaceholder={true}
      placeholder={
        <div style={{ padding: "20px", textAlign: "center" }}>
          Загрузка...
        </div>
      }
    >
      <img src={photoUrl} alt="Photo" />
    </ImagePreloader>
  );
}

// ============================================
// Пример 5: С динамическими изображениями
// ============================================
export function CardWithDynamicImages({ imageUrls }: { imageUrls: string[] }) {
  const { isReady, imageRefs, setImageRef, handleImageLoad, handleImageError } = useImagePreloader({
    imageUrls,
  });

  return (
    <div style={{ opacity: isReady ? 1 : 0 }}>
      {imageUrls.map((url, index) => (
        <img
          key={url}
          ref={(el) => setImageRef(index, el)}
          src={url}
          onLoad={() => handleImageLoad(index)}
          onError={() => handleImageError(index)}
          alt={`Image ${index}`}
        />
      ))}
    </div>
  );
}
