<script lang="ts">
  import { t } from "$lib/i18n/translations";
  import { ApiError } from "$lib/types/api";

  let {
    error,
    onRetry,
  }: {
    error: ApiError | Error;
    onRetry?: () => void;
  } = $props();

  function getErrorInfo(error: ApiError | Error) {
    if (error instanceof ApiError) {
      switch (error.status) {
        case 404:
          return {
            title: t("error_not_found_title"),
            message: t("error_not_found_message"),
            icon: "🔍",
            showRetry: false,
          };
        case 408:
        case undefined:
          return {
            title: t("error_timeout_title"),
            message: t("error_timeout_message"),
            icon: "⏱️",
            showRetry: true,
          };
        case 500:
        case 502:
        case 503:
          return {
            title: t("error_server_title"),
            message: t("error_server_message"),
            icon: "⚠️",
            showRetry: true,
          };
        default:
          return {
            title: t("error_generic_title"),
            message: error.message || t("error_generic_message"),
            icon: "❌",
            showRetry: true,
          };
      }
    }

    return {
      title: t("error_generic_title"),
      message: error.message || t("error_generic_message"),
      icon: "❌",
      showRetry: true,
    };
  }

  const errorInfo = $derived(getErrorInfo(error));
</script>

<div class="flex flex-col items-center justify-center min-h-[400px] p-8">
  <div class="text-center max-w-md mx-auto">
    <div class="text-6xl mb-4">{errorInfo.icon}</div>
    <h1 class="text-2xl font-bold text-gray-800 mb-3">{errorInfo.title}</h1>
  </div>
</div>
