<script lang="ts">
  import {
    guestTokenFromURL,
    guestURL,
    previousVisit,
  } from "$lib/guest-session";
  import { onMount } from "svelte";
  import { randomUUID } from "../../../../shared/browser";
  import {
    t,
    guestText,
    localeInfo,
    translations_keys,
    type LocaleKey,
  } from "$lib/i18n/translations";
  import { locale_state } from "$lib/states.svelte";
  import { formatDate } from "$lib/utils/dateUtils";
  import DoorOpenerV2 from "$lib/components/DoorOpenerV2.svelte";
  import Colazioni from "$lib/components/colazioni/Colazioni.svelte";
  import UsagePeriodWarn from "$lib/components/colazioni/UsagePeriodWarn.svelte";
  let code = $state(""),
    data = $state<any>(null),
    loaded = $state(false),
    tab = $state("doors"),
    clock = $state(Date.now()),
    open = $state(false),
    allButtonsDisabled = $state(false),
    hasRedeemed = $state(false);
  let dropdownRef = $state<HTMLDivElement>();
  let activeAction = false;
  let loadRequest = 0;
  let memoryPending: { id: string; quantity: number; codeId: string } | null =
    null;
  function readPending() {
    try {
      const value = JSON.parse(
        sessionStorage.getItem("oshost.breakfast.pending") ?? "null",
      );
      if (
        typeof value?.id === "string" &&
        typeof value?.codeId === "string" &&
        Number.isInteger(value?.quantity)
      )
        return value as NonNullable<typeof memoryPending>;
    } catch {
      /* A pending action can also survive in memory if storage is unavailable. */
    }
    return memoryPending;
  }
  function savePending(value: typeof memoryPending) {
    memoryPending = value;
    try {
      if (value)
        sessionStorage.setItem(
          "oshost.breakfast.pending",
          JSON.stringify(value),
        );
      else sessionStorage.removeItem("oshost.breakfast.pending");
    } catch {
      /* Storage is optional. */
    }
  }
  const remaining = $derived(
    data?.breakfast
      ? Math.max(0, data.breakfast.total - data.breakfastUsed)
      : 0,
  );
  const today = $derived(
    data
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: data.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(clock)
      : "",
  );
  const breakfastValid = $derived(
    !!data?.breakfast &&
      remaining > 0 &&
      today >= data.breakfast.start &&
      today <= data.breakfast.end,
  );
  const showNavbar = $derived(remaining > 0);
  const isDoors = $derived(tab === "doors"),
    isBreakfast = $derived(tab === "breakfast");
  const normalizedDoors = $derived(
    (data?.doors ?? []).map((d: any) => ({
      ...d,
      times: { from: d.start, to: d.end },
      single_use: d.singleUse,
      used: !!(d.singleUse && d.used),
    })),
  );
  const guestInfo = $derived.by(() => {
    if (!data) return null;
    const starts = (data.staff ? [] : data.doors)
        .map((d: any) => d.start)
        .filter(Boolean)
        .sort(),
      ends = (data.staff ? [] : data.doors)
        .map((d: any) => d.end)
        .filter(Boolean)
        .sort();
    return {
      guest_name: data.label,
      arrival_date: data.staff
        ? undefined
        : (starts[0] ?? data.breakfast?.start),
      departure_date: data.staff
        ? undefined
        : (ends.at(-1) ?? data.breakfast?.end),
    };
  });
  $effect(() => {
    if (typeof document !== "undefined")
      document.documentElement.lang = locale_state.current;
  });
  function guestHref(destination: string) {
    return guestURL(location.href, destination, locale_state.current);
  }
  function navigate(e: MouseEvent, destination: string) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (activeAction) return;
    tab = destination;
    hasRedeemed = false;
    history.pushState(null, "", guestHref(destination));
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function selectLocale(value: LocaleKey) {
    locale_state.current = value;
    try {
      sessionStorage.setItem("oshost.guest.language", value);
    } catch {
      /* The URL keeps the language when storage is unavailable. */
    }
    history.replaceState(null, "", guestHref(tab));
    open = false;
  }
  function handleClickOutside(e: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) open = false;
  }
  function readRoute() {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const language =
      fragment.get("lang") ?? new URLSearchParams(location.search).get("lang");
    if (language && translations_keys.includes(language as LocaleKey))
      locale_state.current = language as LocaleKey;
    tab = fragment.get("page") === "breakfast" ? "breakfast" : "doors";
    hasRedeemed = false;
    const next = guestTokenFromURL(location.href);
    if (next !== code) {
      code = next;
      data = null;
      loaded = false;
      loadRequest++;
      void load();
    }
  }
  onMount(() => {
    // Remove credentials left by older app versions, including legacy pending actions.
    try {
      sessionStorage.removeItem("oshost.guest.code");
      const pending = JSON.parse(
        sessionStorage.getItem("oshost.breakfast.pending") ?? "null",
      );
      if (pending?.code) sessionStorage.removeItem("oshost.breakfast.pending");
    } catch {
      /* Storage is optional; access always comes from the URL. */
    }
    let savedLanguage: string | null = null;
    try {
      savedLanguage = sessionStorage.getItem("oshost.guest.language");
    } catch {
      /* Optional preference. */
    }
    const hash = new URLSearchParams(location.hash.slice(1));
    const language =
      hash.get("lang") ??
      new URLSearchParams(location.search).get("lang") ??
      savedLanguage ??
      navigator.language.slice(0, 2);
    locale_state.current = translations_keys.includes(language as LocaleKey)
      ? (language as LocaleKey)
      : "en";
    code = guestTokenFromURL(location.href);
    readRoute();
    void load();
    const timer = setInterval(() => (clock = Date.now()), 15000);
    const refresh = () => {
      clock = Date.now();
      if (!activeAction) void load();
    };
    window.addEventListener("popstate", readRoute);
    window.addEventListener("hashchange", readRoute);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("popstate", readRoute);
      window.removeEventListener("hashchange", readRoute);
      window.removeEventListener("focus", refresh);
    };
  });
  async function request(path = "", body?: any, key?: string) {
    const credential = guestTokenFromURL(location.href);
    let hint: { label: string; date: string } | undefined;
    try {
      hint = previousVisit(localStorage);
    } catch {
      /* Storage is optional. */
    }
    const r = await fetch("/api/v1/guest" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + credential,
        ...(hint
          ? {
              "X-Oshost-Previous-Visit": encodeURIComponent(
                JSON.stringify(hint),
              ),
            }
          : {}),
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await r.json();
    if (credential !== guestTokenFromURL(location.href))
      throw Object.assign(Error("Guest link changed"), { stale: true });
    if (!r.ok) throw Object.assign(Error(result.error), { status: r.status });
    return result;
  }
  async function load() {
    const ticket = ++loadRequest;
    try {
      const next = await request();
      if (ticket !== loadRequest) return;
      data = next;
      try {
        localStorage.setItem(
          "oshost.guest.visit",
          JSON.stringify({
            label: String(next.label).slice(0, 120),
            date: new Date().toISOString(),
          }),
        );
      } catch {
        /* Storage is optional. */
      }
    } catch (e) {
      if (ticket !== loadRequest || (e as any).stale) return;
      if (!data || [401, 403].includes((e as any).status)) data = null;
    } finally {
      if (ticket === loadRequest) loaded = true;
    }
  }
  async function openDoor(door: any) {
    if (activeAction) throw Error(guestText("uncertain"));
    if (!navigator.onLine) throw Error(guestText("offline"));
    activeAction = true;
    try {
      const result = await request(
        "/doors/" + door.id + "/open",
        {},
        randomUUID(),
      );
      await load();
      return result;
    } catch (e) {
      if ((e as any).stale) throw e;
      await load();
      if ((e as any).status >= 400 && (e as any).status < 500)
        return { status: "failed" as const, detail: (e as Error).message };
      throw e;
    } finally {
      activeAction = false;
    }
  }
  async function redeem(quantity: number) {
    if (activeAction) throw Error(guestText("offline"));
    if (!navigator.onLine) throw Error(guestText("offline"));
    const codeId = data?.codeId;
    if (!codeId) throw Error(guestText("offline"));
    const pending = readPending();
    if (pending && pending.codeId === codeId && pending.quantity !== quantity)
      throw Error(guestText("pendingBreakfast"));
    const id = pending && pending.codeId === codeId ? pending.id : randomUUID();
    savePending({ id, quantity, codeId });
    activeAction = true;
    try {
      const result = await request("/breakfast", { quantity }, id);
      savePending(null);
      hasRedeemed = true;
      if (data)
        data = {
          ...data,
          breakfastUsed: data.breakfast.total - result.remaining,
        };
      await load();
    } catch (e) {
      if ((e as any).stale) throw e;
      if ((e as any).status >= 400 && (e as any).status < 500)
        savePending(null);
      await load();
      throw e;
    } finally {
      activeAction = false;
    }
  }
</script>

<svelte:head><title>oshost · {t("door_access")}</title></svelte:head>
<svelte:window
  onclick={handleClickOutside}
  onkeydown={(e) => {
    if (e.key === "Escape") open = false;
  }}
/>
{#if !loaded}<div
    class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center"
  >
    <span class="text-slate-600">…</span>
  </div>{:else}
  {#if !data}
    <div
      class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4"
    >
      <div
        class="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center"
      >
        <div
          class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <svg
            class="w-8 h-8 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            ></path>
          </svg>
        </div>
        <p class="text-slate-800 text-xl font-semibold">{t("invalid_code")}</p>
      </div>
    </div>
  {:else}
    <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <!-- Header -->
      <header
        class="bg-white/70 backdrop-blur-sm border-b border-white/50 z-50 relative"
      >
        <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <!-- Guest Info on the Left -->
            {#if guestInfo?.guest_name}
              <div class="text-left min-w-0 flex-shrink">
                <p class="text-base font-medium text-slate-800 truncate">
                  {guestInfo.guest_name}
                </p>
                {#if guestInfo.arrival_date && guestInfo.departure_date}
                  <p class="text-sm text-slate-600 truncate">
                    {formatDate(guestInfo.arrival_date)} - {formatDate(
                      guestInfo.departure_date,
                    )}
                  </p>
                {/if}
              </div>
            {/if}

            <!-- Language Selector on the Right -->
            <div class="relative z-50 flex-shrink-0" bind:this={dropdownRef}>
              <button
                class="flex items-center space-x-2 px-3 py-2 text-base font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors duration-200"
                onclick={() => (open = !open)}
                aria-expanded={open}
                aria-label="Select language"
              >
                <span class="text-lg"
                  >{localeInfo[locale_state.current].emoji}</span
                >
                <svg
                  class="w-4 h-4 transition-transform duration-200 {open
                    ? 'rotate-180'
                    : ''}"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                  ></path>
                </svg>
              </button>

              {#if open}
                <div
                  class="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[180px] z-50"
                >
                  {#each Object.entries(localeInfo) as [key, info] (key)}
                    {#if key !== locale_state.current}
                      <button
                        class="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 transition-colors duration-150"
                        onclick={() => selectLocale(key as LocaleKey)}
                        aria-label="Switch to {key}"
                      >
                        <span class="text-lg">{info.emoji}</span>
                        <div class="flex-1">
                          <div class="font-medium text-slate-800 text-base">
                            {info.name}
                          </div>
                          <div class="text-sm text-slate-500 uppercase">
                            {key}
                          </div>
                        </div>
                      </button>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      </header>

      <!-- Sticky Navigation -->
      {#if showNavbar}
        <nav
          class="sticky top-0 z-40 bg-gradient-to-b from-white via-white/95 to-white/90 backdrop-blur-xl border-b border-slate-200/50 shadow-lg"
        >
          <div class="max-w-4xl mx-auto py-2 px-3">
            <div
              class="flex items-center gap-3 bg-gradient-to-br from-slate-50 to-slate-100/80 rounded-2xl p-2 shadow-inner border border-slate-200/30"
            >
              <a
                href={guestHref("doors")}
                onclick={(e) => navigate(e, "doors")}
                class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-lg font-semibold transition-all duration-300 transform flex-1 min-h-[48px] relative overflow-hidden group
                {isDoors
                  ? 'bg-gradient-to-br from-emerald-600 via-emerald-700 to-cyan-700 text-white shadow-lg shadow-emerald-400/25 scale-[1.02] translate-y-[-1px]'
                  : 'text-slate-700 hover:text-white bg-gradient-to-br from-slate-200 to-slate-300 hover:from-emerald-500 hover:to-cyan-600 shadow-md hover:shadow-lg hover:scale-[1.01] hover:translate-y-[-0.5px] border border-slate-300'}"
              >
                {#if isDoors}
                  <div
                    class="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent rounded-xl"
                  ></div>
                {/if}
                <span class="text-2xl relative z-10 drop-shadow-sm">🔐</span>
                <span class="relative z-10 tracking-wide"
                  >{t("door_access")}</span
                >
                {#if !isDoors}
                  <div
                    class="absolute inset-0 bg-gradient-to-br from-emerald-400/0 via-emerald-500/20 to-cyan-600/15 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  ></div>
                {/if}
              </a>
              <a
                href={guestHref("breakfast")}
                onclick={(e) => navigate(e, "breakfast")}
                class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-lg font-semibold transition-all duration-300 transform flex-1 min-h-[48px] relative overflow-hidden group
                {isBreakfast
                  ? 'bg-gradient-to-br from-amber-600 via-orange-600 to-orange-700 text-white shadow-lg shadow-orange-400/25 scale-[1.02] translate-y-[-1px]'
                  : 'text-slate-700 hover:text-white bg-gradient-to-br from-slate-200 to-slate-300 hover:from-amber-500 hover:to-orange-600 shadow-md hover:shadow-lg hover:scale-[1.01] hover:translate-y-[-0.5px] border border-slate-300'}"
              >
                {#if isBreakfast}
                  <div
                    class="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent rounded-xl"
                  ></div>
                {/if}
                <span class="text-2xl relative z-10 drop-shadow-sm">🥐</span>
                <span class="relative z-10 tracking-wide"
                  >{t("breakfast_section_title")}</span
                >
                {#if !isBreakfast}
                  <div
                    class="absolute inset-0 bg-gradient-to-br from-amber-400/0 via-amber-500/20 to-orange-600/15 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  ></div>
                {/if}
              </a>
            </div>
          </div>
        </nav>
      {/if}

      <!-- Main Content -->
      <main class="max-w-4xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
        {#if tab === "doors"}<section>
            <div class="text-center mb-12">
              <div class="text-5xl mb-6">🔐</div>
              <h2 class="text-3xl font-bold text-slate-800 mb-4">
                {t("door_access")}
              </h2>
              <p
                class="text-slate-600 text-lg max-w-2xl mx-auto leading-relaxed"
              >
                {data.staff ? guestText("staffIntro") : t("subtitle")}
              </p>
            </div>
            <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {#each normalizedDoors as door (door.id)}
                <DoorOpenerV2
                  {door}
                  bind:allButtonsDisabled
                  {clock}
                  timezone={data.timezone}
                  onOpen={openDoor}
                />
              {/each}
            </div>
          </section>{:else}<div class="text-center m-6">
            <div class="text-6xl mb-6">🥐</div>
            <h3 class="text-3xl font-bold text-slate-800 mb-4">
              {remaining}
              {t("colazioni_available")}
            </h3>
            {#if breakfastValid}<p class="text-slate-600 text-lg">
                {t("breakfast_section_subtitle")}
              </p>{/if}
          </div>
          <section class="text-center">
            {#if data.breakfast && (breakfastValid || hasRedeemed)}
              <Colazioni
                remaining_colazioni={remaining}
                breakfast={data.breakfast}
                {today}
                timezone={data.timezone}
                onRedeem={redeem}
                onSuccessDismiss={() => (hasRedeemed = false)}
              />
            {:else if remaining <= 0}
              <div
                class="bg-white/70 backdrop-blur-sm rounded-2xl px-8 py-6 inline-block shadow-sm border border-white/50 mb-6"
              >
                <p class="text-slate-700 text-lg">
                  {t("no_colazioni_available_message")}
                </p>
              </div>
              <a
                href={guestHref("doors")}
                onclick={(e) => navigate(e, "doors")}
                class="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-emerald-600 to-cyan-700 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-cyan-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                ><span class="text-xl">🔐</span><span>{t("door_access")}</span
                ></a
              >
            {:else}<UsagePeriodWarn
                breakfast={data.breakfast}
                {today}
                timezone={data.timezone}
              />{/if}
          </section>{/if}
      </main>
    </div>
  {/if}
{/if}
