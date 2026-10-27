<script setup lang="ts">
import { useId } from 'vue'
const artworkMask = useId()
</script>

<template>
  <span class="brand-lockup" aria-label="Uhai — artificial life laboratory">
    <svg class="brand-icon" viewBox="304 146 646 652" aria-hidden="true">
      <defs>
        <filter :id="artworkMask" color-interpolation-filters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -4 -4 -4 0 11.3" />
        </filter>
      </defs>
      <image
        href="/uhai-identity.png"
        width="1254"
        height="1254"
        :filter="`url(#${artworkMask})`"
      />
    </svg>
    <span class="brand-type">
      <svg class="brand-wordmark" viewBox="252 862 750 160" aria-hidden="true">
        <image
          href="/uhai-identity.png"
          width="1254"
          height="1254"
          :filter="`url(#${artworkMask})`"
        />
      </svg>
      <span>ARTIFICIAL LIFE LABORATORY</span>
    </span>
  </span>
</template>
