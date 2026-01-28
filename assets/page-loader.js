import { ThemeEvents } from '@theme/events';
import { onDocumentReady } from '@theme/utilities';

onDocumentReady(() => {
  const bar = document.getElementById('page-loading-bar');
  if (!bar) return;

  const templateName = window.Theme?.template?.name || document.body.dataset.template || '';
  const isCollectionContext =
    templateName?.includes('collection') || templateName === 'search' || templateName === 'list-collections';

  if (!isCollectionContext) return;

  let activeLoads = 0;
  let hideTimeoutId;

  const MIN_VISIBLE_MS = 250;
  let lastStartTime = 0;

  function showBar() {
    clearTimeout(hideTimeoutId);
    bar.style.display = 'block';
    bar.style.opacity = '1';
    bar.style.transform = 'scaleX(0)';
    bar.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';

    // Kick off a quick initial fill
    requestAnimationFrame(() => {
      bar.style.transform = 'scaleX(0.3)';

      // Slowly progress while loading to avoid snapping
      setTimeout(() => {
        if (activeLoads > 0) {
          bar.style.transform = 'scaleX(0.7)';
        }
      }, 200);
    });
  }

  function hideBar() {
    const elapsed = performance.now() - lastStartTime;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

    hideTimeoutId = setTimeout(() => {
      bar.style.transform = 'scaleX(1)';
      bar.style.opacity = '0';
      // After fade-out, reset transform for the next navigation
      setTimeout(() => {
        if (activeLoads === 0) {
          bar.style.transform = 'scaleX(0)';
        }
      }, 250);
    }, remaining);
  }

  function startLoading() {
    if (!isCollectionContext) return;
    if (activeLoads === 0) {
      lastStartTime = performance.now();
      showBar();
    }
    activeLoads += 1;
  }

  function finishLoading() {
    if (activeLoads === 0) return;
    activeLoads = Math.max(0, activeLoads - 1);
    if (activeLoads === 0) {
      hideBar();
    }
  }

  function waitForCriticalImages() {
    return new Promise((resolve) => {
      const main = document.getElementById('MainContent');
      if (!main) {
        resolve();
        return;
      }

      const selector = '.product-grid .card-gallery img, results-list .card-gallery img, img[data-critical="true"]';
      const images = Array.from(main.querySelectorAll(selector));

      if (!images.length) {
        resolve();
        return;
      }

      let remaining = images.length;
      const done = () => {
        remaining -= 1;
        if (remaining <= 0) {
          resolve();
        }
      };

      const timeoutId = setTimeout(resolve, 2000);

      images.forEach((img) => {
        if (!(img instanceof HTMLImageElement)) {
          done();
          return;
        }

        if (img.complete && img.naturalWidth > 0) {
          done();
        } else {
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        }
      });

      // Ensure we clear timeout when resolved early
      Promise.resolve().then(() => {
        if (remaining <= 0) clearTimeout(timeoutId);
      });
    });
  }

  // Public API in case we want to hook from other scripts later
  window.CollectionLoader = {
    start: startLoading,
    finish: finishLoading,
  };

  // Full-page navigations: start on unload
  window.addEventListener('beforeunload', () => {
    startLoading();
  });

  // Collection filter updates (AJAX via facets)
  document.addEventListener(ThemeEvents.FilterUpdate, () => {
    startLoading();

    // Watch for product grid content changes, then wait for images
    const main = document.getElementById('MainContent');
    if (!main) return;

    const grid = main.querySelector('.product-grid, results-list');
    if (!grid) return;

    const observer = new MutationObserver(() => {
      observer.disconnect();
      waitForCriticalImages().then(finishLoading);
    });

    observer.observe(grid, { childList: true, subtree: true });
  });
});

