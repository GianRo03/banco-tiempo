
    // ==============================
    // 1) CONFIGURACION SUPABASE
    // ==============================

    const SUPABASE_URL = "https://ijebomcckctjwjtlvzbq.supabase.co";
    const SUPABASE_KEY = "sb_publishable_Fxei-HvrWPaYI3Jpj3L5WQ_laIMFaW_";

    const sb = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

    var auth = null;
    var db = null;

    // ==============================
    // 2) CONSTANTES Y ESTADO GLOBAL
    // ==============================

    // Imagen por defecto para usuarios sin foto valida.
    var DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

    // Tamano maximo para fotos de perfil (5MB).
    var PROFILE_MAX_BYTES = 5 * 1024 * 1024;

    // Tamano maximo para imagen de chat (10MB).
    var CHAT_MAX_BYTES = 10 * 1024 * 1024;

    // Estado central de la aplicacion.
    var state = {
      authUser: null,           // Usuario autenticado de Firebase Auth.
      uid: "",                  // UID del usuario autenticado.
      myProfile: null,          // Documento users/<uid> normalizado.
      usersMap: new Map(),      // Cache de usuarios para buscador y chat.
      activeSection: "dashboard", // Seccion activa en UI.
      activeChatUserId: "",     // UID del contacto en chat.
      activeChatId: "",         // ID unico para chat entre 2 usuarios.
      searchTerm: "",           // Texto actual del buscador.
      historyFromDocs: [],      // Transferencias enviadas por el usuario actual.
      historyToDocs: []         // Transferencias recibidas por el usuario actual.
    };

    // Estado auxiliar del modulo de servicios sin tocar la logica base existente.
    var serviceRuntime = {
      unsubscribe: null,
      boundChatId: "",
      doc: null,
      profileStamp: "",
      historyStamp: ""
    };

    // Referencias a listeners para poder limpiar suscripciones al cambiar de usuario.
    var unsubscribers = {
      profile: null,     // Listener de users/<uid>.
      users: null,       // Listener de coleccion users.
      messages: null,    // Listener de mensajes del chat activo.
      historyFrom: null, // Listener de history where from == uid.
      historyTo: null    // Listener de history where to == uid.
    };
    var chatRealtimeChannel = null;

    // ==============================
    // 3) HELPERS DE DOM
    // ==============================

    // Helper corto para obtener elementos por id.
    function byId(id) {
      return document.getElementById(id);
    }

    // Objeto con todos los nodos usados frecuentemente.
    var ui = {
      loadingOverlay: byId("loadingOverlay"),
      loadingText: byId("loadingText"),
      toast: byId("toast"),

      authSection: byId("authSection"),
      appSection: byId("appSection"),
      authForm: byId("authForm"),
      authEmail: byId("authEmail"),
      authPassword: byId("authPassword"),
      btnLoginEmail: byId("btnLoginEmail"),
      btnRegisterEmail: byId("btnRegisterEmail"),
      btnLoginGoogle: byId("btnLoginGoogle"),

      sidebar: byId("sidebar"),
      mobileSidebarOverlay: byId("mobileSidebarOverlay"),
      btnToggleSidebar: byId("btnToggleSidebar"),
      btnLogout: byId("btnLogout"),
      navButtons: Array.prototype.slice.call(document.querySelectorAll(".nav-btn")),

      sidebarEmail: byId("sidebarEmail"),
      sidebarCredits: byId("sidebarCredits"),
      sidebarRating: byId("sidebarRating"),

      sections: {
        dashboard: byId("section-dashboard"),
        search: byId("section-search"),
        chat: byId("section-chat"),
        history: byId("section-history"),
        services: byId("section-services")
      },

      sidebarMiniAvatar: byId("sidebarMiniAvatar"),
      sidebarMiniName: byId("sidebarMiniName"),

      profileSummary: byId("profileSummary"),
      profileForm: byId("profileForm"),
      profileSkill: byId("profileSkill"),
      profileHours: byId("profileHours"),
      profilePhoto: byId("profilePhoto"),
      btnSaveProfile: byId("btnSaveProfile"),

      searchSkillInput: byId("searchSkillInput"),
      searchResults: byId("searchResults"),

      chatUsersList: byId("chatUsersList"),
      chatHeaderPhoto: byId("chatHeaderPhoto"),
      chatHeaderName: byId("chatHeaderName"),
      messagesContainer: byId("messagesContainer"),
      btnStartService: byId("btnStartService"),
      btnStopService: byId("btnStopService"),
      serviceRoleBadge: byId("serviceRoleBadge"),
      serviceTimer: byId("serviceTimer"),
      serviceStateText: byId("serviceStateText"),
      serviceCreditsPreview: byId("serviceCreditsPreview"),
      chatForm: byId("chatForm"),
      chatText: byId("chatText"),
      chatImage: byId("chatImage"),
      btnSendMessage: byId("btnSendMessage"),

      historyList: byId("historyList"),
      servicesActiveChat: byId("servicesActiveChat"),
      servicesLiveDuration: byId("servicesLiveDuration"),
      servicesLiveCredits: byId("servicesLiveCredits"),
      servicesLiveStatus: byId("servicesLiveStatus"),
      servicesLiveMeta: byId("servicesLiveMeta")
    };

    // ==============================
    // 4) HELPERS DE SEGURIDAD/FORMATO
    // ==============================

    // Escapa HTML para evitar inyeccion en contenido renderizado.
    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    // Escapa atributos HTML (misma estrategia que escapeHtml).
    function escapeAttr(value) {
      return escapeHtml(value);
    }

    // Normaliza strings para prevenir undefined/null en UI.
    function safeString(value, fallback) {
      var safeFallback = typeof fallback === "string" ? fallback : "";
      if (typeof value !== "string") {
        return safeFallback;
      }
      var trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : safeFallback;
    }

    // Normaliza numeros con fallback.
    function safeNumber(value, fallback) {
      var parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
      return Number.isFinite(fallback) ? Number(fallback) : 0;
    }

    // Normaliza enteros positivos.
    function safeInt(value, fallback) {
      var parsed = parseInt(value, 10);
      if (Number.isInteger(parsed)) {
        return parsed;
      }
      return Number.isInteger(fallback) ? fallback : 0;
    }

    // Limita valores entre min y max.
    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    // Convierte URL en una URL de imagen segura con fallback.
    function safeImageUrl(value) {
      var url = safeString(value, "");
      if (!url) {
        return DEFAULT_AVATAR;
      }
      return url;
    }

    // Formatea rating con 1 decimal y evita NaN.
    function formatRating(value) {
      var rating = clamp(safeNumber(value, 5), 0, 5);
      return rating.toFixed(1);
    }

    // Formatea fecha en locale de usuario (es-GT).
    function formatDateTime(ms) {
      var timestamp = safeInt(ms, 0);
      if (timestamp <= 0) {
        return "Sin fecha";
      }
      return new Date(timestamp).toLocaleString("es-GT", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    // Genera un chatId unico y simetrico para 2 usuarios.
    function buildChatId(uidA, uidB) {
      return [uidA, uidB].sort().join("__");
    }

    // Crea un nombre de archivo seguro para rutas Storage.
    function sanitizeFileName(fileName) {
      return String(fileName || "image")
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]/g, "");
    }

    // Parsea errores del backend en mensajes comprensibles.
    function parseFirebaseError(error) {
      if (!error || !error.code) {
        if (error && error.message) {
          return String(error.message);
        }
        return "Ocurrio un error inesperado. Intenta nuevamente.";
      }
      var messages = {
        "auth/email-already-in-use": "El correo ya esta registrado.",
        "auth/invalid-email": "El correo no es valido.",
        "auth/user-not-found": "No existe una cuenta con ese correo.",
        "auth/wrong-password": "Contrasena incorrecta.",
        "auth/weak-password": "La contrasena debe tener al menos 6 caracteres.",
        "auth/email-not-confirmed": "Confirma tu correo para completar el acceso.",
        "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de completar el acceso.",
        "auth/account-exists-with-different-credential": "Ese correo ya usa otro metodo de autenticacion.",
        "permission-denied": "No tienes permisos para completar esta operacion.",
        "not-found": "No se encontro el registro solicitado.",
        "supabase/error": "No se pudo completar la operacion en Supabase.",
        "storage/unauthorized": "No tienes permiso para subir este archivo.",
        "storage/canceled": "La subida se cancelo antes de terminar.",
        "storage/unknown": "No se pudo completar la subida en Storage."
      };
      return messages[error.code] || (error.message ? String(error.message) : "Error de backend no identificado.");
    }

    function normalizeSupabaseError(error) {
      if (error instanceof Error && error.code) {
        return error;
      }

      var rawMessage = error && error.message ? String(error.message) : "Error de backend.";
      var message = rawMessage || "Error de backend.";
      var code = error && error.code ? String(error.code) : "";
      var lower = message.toLowerCase();

      if (!code && error && error.status) {
        code = String(error.status);
      }

      if (lower.indexOf("invalid login credentials") >= 0) {
        code = "auth/wrong-password";
      } else if (lower.indexOf("user already registered") >= 0) {
        code = "auth/email-already-in-use";
      } else if (lower.indexOf("email not confirmed") >= 0) {
        code = "auth/email-not-confirmed";
      } else if (lower.indexOf("password should be at least") >= 0) {
        code = "auth/weak-password";
      } else if (lower.indexOf("invalid email") >= 0) {
        code = "auth/invalid-email";
      } else if (lower.indexOf("row-level security") >= 0) {
        code = "permission-denied";
      }

      var wrapped = new Error(message);
      wrapped.code = code || "supabase/error";
      wrapped.original = error || null;
      return wrapped;
    }

    function mapSupabaseUser(user) {
      if (!user) {
        return null;
      }

      var metadata = user.user_metadata || {};
      var photo =
        (metadata && (metadata.avatar_url || metadata.picture || metadata.photo_url)) ||
        "";

      return {
        uid: String(user.id || ""),
        id: String(user.id || ""),
        email: safeString(user.email, ""),
        photoURL: safeString(photo, ""),
        raw: user
      };
    }

    async function register(email, password) {
      var payload = {
        email: safeString(email, ""),
        password: safeString(password, "")
      };
      var result = await sb.auth.signUp(payload);
      if (result.error) {
        console.error(result.error);
        throw normalizeSupabaseError(result.error);
      }
      return {
        user: mapSupabaseUser(result.data ? result.data.user : null)
      };
    }

    async function login(email, password) {
      var result = await sb.auth.signInWithPassword({
        email: safeString(email, ""),
        password: safeString(password, "")
      });
      if (result.error) {
        console.error(result.error);
        throw normalizeSupabaseError(result.error);
      }
      return {
        user: mapSupabaseUser(result.data && result.data.user ? result.data.user : null)
      };
    }

    async function logout() {
      var result = await sb.auth.signOut();
      if (result.error) {
        throw normalizeSupabaseError(result.error);
      }
    }

    async function getUser() {
      var result = await sb.auth.getUser();
      if (result.error) {
        throw normalizeSupabaseError(result.error);
      }
      return result.data ? result.data.user : null;
    }

    function generateDocId() {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }
      return "doc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
    }

    function pruneUndefinedFields(input) {
      var output = {};
      Object.keys(input || {}).forEach(function (key) {
        if (typeof input[key] !== "undefined") {
          output[key] = input[key];
        }
      });
      return output;
    }

    function safeDocId(value) {
      if (value === null || typeof value === "undefined" || value === "") {
        return generateDocId();
      }
      return String(value);
    }

    function cloneQueryState(state) {
      var source = state || {};
      return {
        filters: Array.isArray(source.filters) ? source.filters.slice() : [],
        orderBy: source.orderBy
          ? { field: source.orderBy.field, direction: source.orderBy.direction }
          : null,
        limit: Number.isInteger(source.limit) ? source.limit : null
      };
    }

    function resolvePathMeta(pathSegments) {
      var segments = Array.isArray(pathSegments) ? pathSegments.slice() : [];
      if (!segments.length) {
        throw new Error("Ruta de coleccion/documento invalida.");
      }

      var root = String(segments[0] || "");
      if (root === "users") {
        if (segments.length === 1) {
          return { table: "profiles", kind: "collection", root: root };
        }
        if (segments.length === 2) {
          return {
            table: "profiles",
            kind: "doc",
            root: root,
            id: safeDocId(segments[1])
          };
        }

        var userId = safeDocId(segments[1]);
        var child = safeString(segments[2], "");
        var allowedSubcollections = {
          notifications: true,
          transactions: true,
          credits: true
        };
        if (!allowedSubcollections[child]) {
          throw new Error("Subcoleccion de usuario no soportada: " + child);
        }

        if (segments.length === 3) {
          return {
            table: child,
            kind: "collection",
            root: root,
            userId: userId,
            subcollection: child
          };
        }

        if (segments.length === 4) {
          return {
            table: child,
            kind: "doc",
            root: root,
            userId: userId,
            subcollection: child,
            id: safeDocId(segments[3])
          };
        }

        throw new Error("Ruta de usuario no soportada.");
      }

      if (segments.length === 1) {
        return {
          table: root,
          kind: "collection",
          root: root
        };
      }

      if (segments.length === 2) {
        return {
          table: root,
          kind: "doc",
          root: root,
          id: safeDocId(segments[1])
        };
      }

      throw new Error("Ruta no soportada: " + segments.join("/"));
    }

    function mapFieldToColumn(table, field) {
      var key = safeString(field, "");
      if (table === "profiles") {
        if (key === "uid") {
          return "id";
        }
        if (key === "skill") {
          return "skills";
        }
        if (key === "hours") {
          return "disponibilidad";
        }
        if (key === "credits") {
          return "creditos";
        }
        if (key === "photo") {
          return "foto_url";
        }
      }
      return key;
    }

    function normalizeInteger(value, fallback) {
      var parsed = parseInt(value, 10);
      if (Number.isInteger(parsed)) {
        return parsed;
      }
      return Number.isInteger(fallback) ? fallback : 0;
    }

    function serializeForTable(meta, data) {
      var payload = Object.assign({}, data || {});

      if (meta.kind === "doc" && meta.id) {
        payload.id = safeDocId(meta.id);
      }

      if (meta.userId) {
        payload.user_id = safeDocId(meta.userId);
      }

      if (meta.table === "profiles") {
        var resolvedUid = safeString(payload.uid, safeString(payload.id, safeString(meta.id, "")));
        if (resolvedUid) {
          payload.uid = resolvedUid;
          payload.id = resolvedUid;
        }

        if (typeof payload.skill !== "undefined" && typeof payload.skills === "undefined") {
          payload.skills = payload.skill;
        }
        if (typeof payload.skills !== "undefined" && typeof payload.skill === "undefined") {
          payload.skill = payload.skills;
        }
        if (typeof payload.hours !== "undefined" && typeof payload.disponibilidad === "undefined") {
          payload.disponibilidad = payload.hours;
        }
        if (typeof payload.disponibilidad !== "undefined" && typeof payload.hours === "undefined") {
          payload.hours = payload.disponibilidad;
        }
        if (typeof payload.credits !== "undefined" && typeof payload.creditos === "undefined") {
          payload.creditos = payload.credits;
        }
        if (typeof payload.creditos !== "undefined" && typeof payload.credits === "undefined") {
          payload.credits = payload.creditos;
        }
        if (typeof payload.photo !== "undefined" && typeof payload.foto_url === "undefined") {
          payload.foto_url = payload.photo;
        }
        if (typeof payload.foto_url !== "undefined" && typeof payload.photo === "undefined") {
          payload.photo = payload.foto_url;
        }
        if (typeof payload.reviews !== "undefined" && typeof payload.reviewsCount === "undefined") {
          payload.reviewsCount = payload.reviews;
        }
        if (typeof payload.reviewsCount !== "undefined" && typeof payload.reviews === "undefined") {
          payload.reviews = payload.reviewsCount;
        }

        payload.creditos = normalizeInteger(payload.creditos, 0);
        payload.credits = normalizeInteger(payload.credits, payload.creditos);
        payload.reviews = normalizeInteger(payload.reviews, 0);
        payload.reviewsCount = normalizeInteger(payload.reviewsCount, payload.reviews);
      }

      return pruneUndefinedFields(payload);
    }

    function deserializeFromTable(meta, row) {
      var source = Object.assign({}, row || {});
      if (meta.table === "profiles") {
        var uid = safeString(source.uid, safeString(source.id, safeString(meta.id, "")));
        source.uid = uid;
        source.id = uid || safeString(source.id, "");
        source.skill = safeString(source.skill, safeString(source.skills, ""));
        source.skills = safeString(source.skills, source.skill);
        source.hours = safeString(source.hours, safeString(source.disponibilidad, ""));
        source.disponibilidad = safeString(source.disponibilidad, source.hours);
        source.photo = safeString(source.photo, safeString(source.foto_url, ""));
        source.foto_url = safeString(source.foto_url, source.photo);
        source.credits = normalizeInteger(
          typeof source.credits !== "undefined" ? source.credits : source.creditos,
          0
        );
        source.creditos = normalizeInteger(
          typeof source.creditos !== "undefined" ? source.creditos : source.credits,
          source.credits
        );
        source.rating = Number.isFinite(Number(source.rating)) ? Number(source.rating) : 5;
        source.reviews = normalizeInteger(
          typeof source.reviews !== "undefined" ? source.reviews : source.reviewsCount,
          0
        );
        source.reviewsCount = normalizeInteger(
          typeof source.reviewsCount !== "undefined" ? source.reviewsCount : source.reviews,
          source.reviews
        );
      }

      if (meta.userId) {
        source.user_id = safeString(source.user_id, meta.userId);
      }
      return source;
    }

    function resolveRowId(meta, row) {
      if (meta.table === "profiles") {
        return safeDocId(row && (row.id || row.uid));
      }
      return safeDocId(row && row.id);
    }

    function createDocSnapshot(docRef, exists, data) {
      var payload = exists ? Object.assign({}, data || {}) : undefined;
      return {
        id: docRef.id,
        exists: Boolean(exists),
        data: function () {
          if (!exists) {
            return undefined;
          }
          return Object.assign({}, payload);
        }
      };
    }

    function createQuerySnapshot(docs) {
      var list = Array.isArray(docs) ? docs.slice() : [];
      return {
        docs: list,
        forEach: function (cb) {
          list.forEach(cb);
        }
      };
    }

    async function fetchDocumentSnapshot(docRef) {
      var meta = resolvePathMeta(docRef._path);
      if (meta.kind !== "doc") {
        throw new Error("Referencia de documento invalida.");
      }

      var query = sb.from(meta.table).select("*").eq("id", meta.id);
      if (meta.userId) {
        query = query.eq("user_id", meta.userId);
      }

      var result = await query.limit(1);
      if (result.error) {
        throw normalizeSupabaseError(result.error);
      }

      var row = Array.isArray(result.data) && result.data.length ? result.data[0] : null;
      if (!row) {
        return createDocSnapshot(docRef, false, null);
      }

      return createDocSnapshot(docRef, true, deserializeFromTable(meta, row));
    }

    async function executeQuery(collectionRef) {
      var meta = resolvePathMeta(collectionRef._path);
      if (meta.kind !== "collection") {
        throw new Error("Referencia de coleccion invalida.");
      }

      var query = sb.from(meta.table).select("*");

      if (meta.userId) {
        query = query.eq("user_id", meta.userId);
      }

      var filters = Array.isArray(collectionRef._query.filters) ? collectionRef._query.filters : [];
      filters.forEach(function (filter) {
        var op = safeString(filter.op, "==");
        if (op !== "==") {
          throw new Error("Operacion where no soportada: " + op);
        }
        var field = mapFieldToColumn(meta.table, filter.field);
        query = query.eq(field, filter.value);
      });

      if (collectionRef._query.orderBy && collectionRef._query.orderBy.field) {
        var orderField = mapFieldToColumn(meta.table, collectionRef._query.orderBy.field);
        var direction = safeString(collectionRef._query.orderBy.direction, "asc").toLowerCase();
        query = query.order(orderField, { ascending: direction !== "desc" });
      }

      if (Number.isInteger(collectionRef._query.limit) && collectionRef._query.limit > 0) {
        query = query.limit(collectionRef._query.limit);
      }

      var result = await query;
      if (result.error) {
        throw normalizeSupabaseError(result.error);
      }

      var rows = Array.isArray(result.data) ? result.data : [];
      var docs = rows.map(function (row) {
        var rowId = resolveRowId(meta, row);
        var docRef = new DocumentRef(collectionRef._path.concat([rowId]));
        var data = deserializeFromTable(resolvePathMeta(docRef._path), row);
        return {
          id: rowId,
          exists: true,
          data: function () {
            return Object.assign({}, data);
          }
        };
      });

      return createQuerySnapshot(docs);
    }

    async function setDocument(docRef, data, options) {
      var meta = resolvePathMeta(docRef._path);
      if (meta.kind !== "doc") {
        throw new Error("Referencia de documento invalida.");
      }

      var payload = serializeForTable(meta, data || {});

      if (options && options.merge) {
        var existing = await fetchDocumentSnapshot(docRef);
        if (existing.exists) {
          var merged = Object.assign({}, existing.data(), payload);
          payload = serializeForTable(meta, merged);
        }
      }

      var onConflictColumns = meta.userId ? "id,user_id" : "id";
      var result = await sb
        .from(meta.table)
        .upsert(payload, { onConflict: onConflictColumns });

      if (result.error) {
        throw normalizeSupabaseError(result.error);
      }
    }

    async function updateDocument(docRef, data) {
      var meta = resolvePathMeta(docRef._path);
      if (meta.kind !== "doc") {
        throw new Error("Referencia de documento invalida.");
      }

      var payload = serializeForTable(meta, data || {});
      delete payload.id;

      var query = sb.from(meta.table).update(payload).eq("id", meta.id);
      if (meta.userId) {
        query = query.eq("user_id", meta.userId);
      }

      var result = await query.select("id");
      if (result.error) {
        throw normalizeSupabaseError(result.error);
      }
      if (!Array.isArray(result.data) || !result.data.length) {
        throw normalizeSupabaseError({ code: "not-found", message: "Documento no encontrado para actualizar." });
      }
    }

    async function deleteDocument(docRef) {
      var meta = resolvePathMeta(docRef._path);
      if (meta.kind !== "doc") {
        throw new Error("Referencia de documento invalida.");
      }

      var query = sb.from(meta.table).delete().eq("id", meta.id);
      if (meta.userId) {
        query = query.eq("user_id", meta.userId);
      }
      var result = await query;
      if (result.error) {
        throw normalizeSupabaseError(result.error);
      }
    }

    function createPollingSubscription(fetcher, onNext, onError) {
      var stopped = false;
      var timer = null;
      var lastKey = "";
      var intervalMs = 1500;

      async function pull() {
        if (stopped) {
          return;
        }
        try {
          var snapshot = await fetcher();
          var key = JSON.stringify(snapshot);
          if (key !== lastKey) {
            lastKey = key;
            onNext(snapshot);
          }
        } catch (error) {
          if (typeof onError === "function") {
            onError(normalizeSupabaseError(error));
          } else {
            console.error(error);
          }
        } finally {
          if (!stopped) {
            timer = window.setTimeout(pull, intervalMs);
          }
        }
      }

      pull();

      return function unsubscribe() {
        stopped = true;
        if (timer) {
          window.clearTimeout(timer);
          timer = null;
        }
      };
    }

    function DocumentRef(pathSegments) {
      this._path = pathSegments.slice();
      this.id = safeDocId(this._path[this._path.length - 1]);
    }

    DocumentRef.prototype.collection = function (name) {
      return new CollectionRef(this._path.concat([safeString(name, "")]), null);
    };

    DocumentRef.prototype.get = function () {
      return fetchDocumentSnapshot(this);
    };

    DocumentRef.prototype.set = function (data, options) {
      return setDocument(this, data, options || null);
    };

    DocumentRef.prototype.update = function (data) {
      return updateDocument(this, data || {});
    };

    DocumentRef.prototype.delete = function () {
      return deleteDocument(this);
    };

    DocumentRef.prototype.onSnapshot = function (onNext, onError) {
      var ref = this;
      return createPollingSubscription(
        async function () {
          var snap = await fetchDocumentSnapshot(ref);
          return {
            id: snap.id,
            exists: snap.exists,
            data: snap.data()
          };
        },
        function (raw) {
          var reconstructed = createDocSnapshot(ref, raw.exists, raw.data);
          onNext(reconstructed);
        },
        onError
      );
    };

    function CollectionRef(pathSegments, queryState) {
      this._path = pathSegments.slice();
      this._query = cloneQueryState(queryState);
    }

    CollectionRef.prototype.doc = function (id) {
      var resolved = safeString(id, "") || generateDocId();
      return new DocumentRef(this._path.concat([resolved]));
    };

    CollectionRef.prototype.add = async function (data) {
      var docRef = this.doc();
      await docRef.set(data || {});
      return docRef;
    };

    CollectionRef.prototype.where = function (field, op, value) {
      var next = cloneQueryState(this._query);
      next.filters.push({
        field: safeString(field, ""),
        op: safeString(op, "=="),
        value: value
      });
      return new CollectionRef(this._path, next);
    };

    CollectionRef.prototype.orderBy = function (field, direction) {
      var next = cloneQueryState(this._query);
      next.orderBy = {
        field: safeString(field, ""),
        direction: safeString(direction, "asc")
      };
      return new CollectionRef(this._path, next);
    };

    CollectionRef.prototype.limit = function (amount) {
      var next = cloneQueryState(this._query);
      var parsed = parseInt(amount, 10);
      next.limit = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
      return new CollectionRef(this._path, next);
    };

    CollectionRef.prototype.get = function () {
      return executeQuery(this);
    };

    CollectionRef.prototype.onSnapshot = function (onNext, onError) {
      var queryRef = this;
      return createPollingSubscription(
        async function () {
          var snapshot = await executeQuery(queryRef);
          return {
            docs: snapshot.docs.map(function (doc) {
              return {
                id: doc.id,
                data: doc.data()
              };
            })
          };
        },
        function (raw) {
          var docs = raw.docs.map(function (item) {
            var payload = Object.assign({}, item.data || {});
            return {
              id: item.id,
              exists: true,
              data: function () {
                return Object.assign({}, payload);
              }
            };
          });
          onNext(createQuerySnapshot(docs));
        },
        onError
      );
    };

    function createBatchAdapter() {
      var operations = [];
      return {
        set: function (docRef, data, options) {
          operations.push({ type: "set", ref: docRef, data: data, options: options || null });
        },
        update: function (docRef, data) {
          operations.push({ type: "update", ref: docRef, data: data });
        },
        delete: function (docRef) {
          operations.push({ type: "delete", ref: docRef });
        },
        commit: async function () {
          for (var i = 0; i < operations.length; i += 1) {
            var op = operations[i];
            if (op.type === "set") {
              await setDocument(op.ref, op.data, op.options);
            } else if (op.type === "update") {
              await updateDocument(op.ref, op.data);
            } else if (op.type === "delete") {
              await deleteDocument(op.ref);
            }
          }
        }
      };
    }

    function createDatabaseAdapter() {
      return {
        collection: function (name) {
          return new CollectionRef([safeString(name, "")], null);
        },
        runTransaction: async function (handler) {
          var operations = [];
          var tx = {
            get: function (docRef) {
              return fetchDocumentSnapshot(docRef);
            },
            set: function (docRef, data, options) {
              operations.push({ type: "set", ref: docRef, data: data, options: options || null });
            },
            update: function (docRef, data) {
              operations.push({ type: "update", ref: docRef, data: data });
            },
            delete: function (docRef) {
              operations.push({ type: "delete", ref: docRef });
            }
          };

          await handler(tx);

          for (var i = 0; i < operations.length; i += 1) {
            var op = operations[i];
            if (op.type === "set") {
              await setDocument(op.ref, op.data, op.options);
            } else if (op.type === "update") {
              await updateDocument(op.ref, op.data);
            } else if (op.type === "delete") {
              await deleteDocument(op.ref);
            }
          }
        },
        batch: function () {
          return createBatchAdapter();
        }
      };
    }

    function createAuthAdapter() {
      var listeners = [];

      function emit(user) {
        var mapped = mapSupabaseUser(user);
        listeners.forEach(function (callback) {
          callback(mapped);
        });
      }

      sb.auth.getUser().then(function (result) {
        if (result && !result.error) {
          emit(result.data ? result.data.user : null);
        }
      });

      sb.auth.onAuthStateChange(function (_event, session) {
        emit(session ? session.user : null);
      });

      return {
        setPersistence: function () {
          return Promise.resolve();
        },
        signInWithEmailAndPassword: function (email, password) {
          return login(email, password);
        },
        createUserWithEmailAndPassword: function (email, password) {
          return register(email, password);
        },
        signInWithPopup: async function () {
          var result = await sb.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: window.location.href,
              queryParams: {
                prompt: "select_account"
              }
            }
          });
          if (result.error) {
            throw normalizeSupabaseError(result.error);
          }
          return { user: null };
        },
        signOut: function () {
          return logout();
        },
        onAuthStateChanged: function (callback) {
          if (typeof callback !== "function") {
            return function () {};
          }
          listeners.push(callback);

          getUser()
            .then(function (user) {
              callback(mapSupabaseUser(user));
            })
            .catch(function () {
              callback(null);
            });

          return function unsubscribe() {
            listeners = listeners.filter(function (item) {
              return item !== callback;
            });
          };
        }
      };
    }

    auth = createAuthAdapter();
    db = createDatabaseAdapter();

    // ==============================
    // 5) HELPERS DE UI
    // ==============================

    // Muestra overlay de carga con texto.
    function setLoading(isLoading, text) {
      if (isLoading) {
        ui.loadingText.textContent = safeString(text, "Procesando...");
        ui.loadingOverlay.classList.remove("hidden");
        ui.loadingOverlay.classList.add("flex");
      } else {
        ui.loadingOverlay.classList.add("hidden");
        ui.loadingOverlay.classList.remove("flex");
      }
    }

    // Muestra notificacion temporal.
    function showToast(message, type) {
      var safeMessage = safeString(message, "Operacion completada.");
      var toastType = safeString(type, "info");
      ui.toast.textContent = safeMessage;
      ui.toast.className = "fixed top-4 right-4 z-50 max-w-sm px-4 py-3 rounded-xl shadow-xl text-sm";
      if (toastType === "error") {
        ui.toast.classList.add("bg-rose-600", "text-white");
      } else if (toastType === "success") {
        ui.toast.classList.add("bg-emerald-600", "text-white");
      } else {
        ui.toast.classList.add("bg-slate-700", "text-slate-100");
      }
      ui.toast.classList.remove("hidden");
      window.clearTimeout(showToast._timer);
      showToast._timer = window.setTimeout(function () {
        ui.toast.classList.add("hidden");
      }, 3200);
    }

    // Activa una sola seccion y sincroniza estado visual.
    function setActiveSection(sectionName) {
      var target = safeString(sectionName, "dashboard");
      state.activeSection = target;

      // Ocultar todas las secciones.
      Object.keys(ui.sections).forEach(function (key) {
        ui.sections[key].classList.add("hidden");
      });

      // Mostrar seccion seleccionada.
      if (ui.sections[target]) {
        ui.sections[target].classList.remove("hidden");
      }

      // Actualizar estilo activo en botones del sidebar.
      ui.navButtons.forEach(function (btn) {
        var isActive = btn.getAttribute("data-nav") === target;
        if (isActive) {
          btn.classList.add("nav-active");
        } else {
          btn.classList.remove("nav-active");
        }
      });

      // Cerrar sidebar en movil luego de navegar.
      closeMobileSidebar();
    }

    // Abre el sidebar en movil.
    function openMobileSidebar() {
      ui.sidebar.classList.remove("-translate-x-full");
      ui.mobileSidebarOverlay.classList.remove("hidden");
    }

    // Cierra el sidebar en movil.
    function closeMobileSidebar() {
      ui.sidebar.classList.add("-translate-x-full");
      ui.mobileSidebarOverlay.classList.add("hidden");
    }

    // ==============================
    // 6) MODELOS NORMALIZADOS
    // ==============================

    // Genera documento users por defecto al registrar usuario.
    function buildDefaultUserDoc(user) {
      return {
        uid: user.uid,
        email: safeString(user.email, "sin-correo@local"),
        photo: safeImageUrl(user.photoURL || ""),
        skill: "",
        hours: "",
        credits: 5,
        rating: 5,
        reviews: 0
      };
    }

    // Normaliza documento users para prevenir undefined en UI.
    function normalizeUserDoc(data, fallbackAuthUser) {
      var base = data || {};
      return {
        uid: safeString(base.uid, fallbackAuthUser ? fallbackAuthUser.uid : ""),
        email: safeString(base.email, fallbackAuthUser ? fallbackAuthUser.email || "sin-correo@local" : "sin-correo@local"),
        photo: safeImageUrl(base.photo),
        skill: safeString(base.skill, "Sin habilidades registradas"),
        hours: safeString(base.hours, "Sin disponibilidad registrada"),
        credits: Math.max(0, safeInt(base.credits, 5)),
        rating: clamp(safeNumber(base.rating, 5), 0, 5),
        reviews: Math.max(0, safeInt(base.reviews, 0))
      };
    }

    // Normaliza documento de mensaje.
    function normalizeMessageDoc(docId, data) {
      var base = data || {};
      return {
        id: docId,
        from: safeString(base.from, ""),
        to: safeString(base.to, ""),
        chatId: safeString(base.chatId, ""),
        text: safeString(base.text, ""),
        img: safeString(base.img, ""),
        time: Math.max(0, safeInt(base.time, 0))
      };
    }

    // Normaliza documento history.
    function normalizeHistoryDoc(docId, data) {
      var base = data || {};
      return {
        id: docId,
        from: safeString(base.from, ""),
        to: safeString(base.to, ""),
        amount: Math.max(0, safeInt(base.amount, 0)),
        time: Math.max(0, safeInt(base.time, 0))
      };
    }

    // ==============================
    // 7) AUTENTICACION Y SESION
    // ==============================

    // Configura persistencia LOCAL para mantener sesion abierta.
    auth.setPersistence("local").catch(function (error) {
      showToast(parseFirebaseError(error), "error");
    });

    // Crea/normaliza documento users/<uid> para usuario autenticado.
    async function ensureUserDoc(user) {
      var userRef = db.collection("users").doc(user.uid);

      // Usamos transaccion para evitar condiciones de carrera.
      await db.runTransaction(async function (tx) {
        var snap = await tx.get(userRef);

        // Si no existe, se crea con defaults requeridos.
        if (!snap.exists) {
          tx.set(userRef, buildDefaultUserDoc(user));
          return;
        }

        // Si existe, se normaliza sin borrar datos utiles.
        var existing = snap.data() || {};
        var normalized = {
          uid: safeString(existing.uid, user.uid),
          email: safeString(existing.email, user.email || "sin-correo@local"),
          photo: safeImageUrl(existing.photo || user.photoURL || ""),
          skill: safeString(existing.skill, ""),
          hours: safeString(existing.hours, ""),
          credits: Math.max(0, safeInt(existing.credits, 5)),
          rating: clamp(safeNumber(existing.rating, 5), 0, 5),
          reviews: Math.max(0, safeInt(existing.reviews, 0))
        };

        // Merge para no perder campos extra que pueda tener el proyecto.
        tx.set(userRef, normalized, { merge: true });
      });
    }

    // Inicia sesion con correo y contrasena.
    async function loginWithEmail() {
      var email = safeString(ui.authEmail.value, "");
      var password = safeString(ui.authPassword.value, "");

      // Validaciones basicas antes de autenticar.
      if (!email) {
        showToast("Ingresa tu correo.", "error");
        return;
      }
      if (password.length < 6) {
        showToast("La contrasena debe tener minimo 6 caracteres.", "error");
        return;
      }

      try {
        setLoading(true, "Iniciando sesion...");
        await auth.signInWithEmailAndPassword(email, password);
        showToast("Sesion iniciada.", "success");
      } catch (error) {
        showToast(parseFirebaseError(error), "error");
      } finally {
        setLoading(false);
      }
    }

    // Registra usuario por email/password y garantiza documento users.
    async function registerWithEmail() {
      var email = safeString(ui.authEmail.value, "");
      var password = safeString(ui.authPassword.value, "");

      // Validaciones locales.
      if (!email) {
        showToast("Ingresa un correo valido para registrarte.", "error");
        return;
      }
      if (password.length < 6) {
        showToast("La contrasena debe tener minimo 6 caracteres.", "error");
        return;
      }

      try {
        setLoading(true, "Creando cuenta...");
        var credentials = await auth.createUserWithEmailAndPassword(email, password);
        if (credentials && credentials.user) {
          await ensureUserDoc(credentials.user);
        }
        showToast("Cuenta creada correctamente.", "success");
      } catch (error) {
        showToast(parseFirebaseError(error), "error");
      } finally {
        setLoading(false);
      }
    }

    // Inicia sesion con Google y garantiza documento users.
    async function loginWithGoogle() {
      try {
        setLoading(true, "Abriendo Google...");
        await auth.signInWithPopup();
        showToast("Redirigiendo a Google...", "success");
      } catch (error) {
        showToast(parseFirebaseError(error), "error");
      } finally {
        setLoading(false);
      }
    }

    // Cierra sesion del usuario actual.
    async function logoutSession() {
      try {
        setLoading(true, "Cerrando sesion...");
        await auth.signOut();
        showToast("Sesion cerrada.", "success");
      } catch (error) {
        showToast(parseFirebaseError(error), "error");
      } finally {
        setLoading(false);
      }
    }

    // ==============================
    // 8) CONTROL DE LISTENERS
    // ==============================

    // Limpia listener individual.
    function stopListener(key) {
      if (typeof unsubscribers[key] === "function") {
        unsubscribers[key]();
        unsubscribers[key] = null;
      }
    }

    // Limpia todos los listeners activos.
    function stopAllListeners() {
      stopListener("profile");
      stopListener("users");
      stopListener("messages");
      stopListener("historyFrom");
      stopListener("historyTo");
    }

    // ==============================
    // 9) PERFIL (DASHBOARD)
    // ==============================

    // Suscribe el documento del perfil actual en tiempo real.
    function subscribeMyProfile() {
      stopListener("profile");

      if (!state.uid) {
        return;
      }

      var myRef = db.collection("users").doc(state.uid);
      unsubscribers.profile = myRef.onSnapshot(
        function (snap) {
          if (!snap.exists) {
            // Si por cualquier motivo no existe, se recrea automaticamente.
            ensureUserDoc(state.authUser).catch(function (error) {
              showToast(parseFirebaseError(error), "error");
            });
            return;
          }

          // Guardamos perfil normalizado para evitar undefined.
          state.myProfile = normalizeUserDoc(snap.data(), state.authUser);

          // Renderizamos panel principal y resumen lateral.
          renderProfileDashboard();
        },
        function (error) {
          showToast(parseFirebaseError(error), "error");
        }
      );
    }

    // Renderiza dashboard con datos completos del usuario actual.
    function renderProfileDashboard() {
      var p = state.myProfile || normalizeUserDoc({}, state.authUser);

      // Actualiza resumen del sidebar.
      ui.sidebarEmail.textContent = p.email;
      ui.sidebarCredits.textContent = String(p.credits);
      ui.sidebarRating.textContent = formatRating(p.rating);

      // Completa campos editables con datos actuales.
      ui.profileSkill.value = safeString(p.skill === "Sin habilidades registradas" ? "" : p.skill, "");
      ui.profileHours.value = safeString(p.hours === "Sin disponibilidad registrada" ? "" : p.hours, "");

      // Construye tarjeta de perfil evitando undefined.
      ui.profileSummary.innerHTML = ""
        + "<div class=\"grid sm:grid-cols-[100px_1fr] gap-4 items-start\">"
        + "  <img"
        + "    src=\"" + escapeAttr(safeImageUrl(p.photo)) + "\""
        + "    alt=\"Foto perfil\""
        + "    class=\"w-24 h-24 rounded-2xl object-cover border border-slate-600\""
        + "    onerror=\"this.onerror=null;this.src='" + escapeAttr(DEFAULT_AVATAR) + "';\""
        + "  />"
        + "  <div class=\"space-y-2\">"
        + "    <p class=\"font-semibold text-lg break-all\">" + escapeHtml(p.email) + "</p>"
        + "    <p class=\"text-sm text-slate-300\"><span class=\"text-slate-400\">UID:</span> " + escapeHtml(p.uid) + "</p>"
        + "    <p class=\"text-sm\"><span class=\"text-slate-400\">Habilidades:</span> " + escapeHtml(p.skill) + "</p>"
        + "    <p class=\"text-sm\"><span class=\"text-slate-400\">Disponibilidad:</span> " + escapeHtml(p.hours) + "</p>"
        + "    <div class=\"flex flex-wrap gap-2 pt-1\">"
        + "      <span class=\"rounded-full bg-emerald-600/20 text-emerald-200 border border-emerald-500/30 px-3 py-1 text-xs\">Creditos: " + escapeHtml(String(p.credits)) + "</span>"
        + "      <span class=\"rounded-full bg-amber-600/20 text-amber-200 border border-amber-500/30 px-3 py-1 text-xs\">Rating: " + escapeHtml(formatRating(p.rating)) + " (" + escapeHtml(String(p.reviews)) + " reviews)</span>"
        + "    </div>"
        + "  </div>"
        + "</div>";
    }

    async function subirImagen(file, userId) {
      const fileName = userId + "_" + Date.now();

      const { data, error } = await sb.storage
          .from("imagenes")
          .upload(fileName, file, { upsert: true });

      if (error) {
          console.error(error);
          return null;
      }

      const { data: urlData } = sb.storage
          .from("imagenes")
          .getPublicUrl(fileName);

      return urlData.publicUrl;
    }

    // Sube una imagen usando Supabase Storage y devuelve URL publica.
    async function uploadImageToStorage(file, storagePath) {
      // Validacion de tipo MIME.
      if (!file || !file.type || file.type.indexOf("image/") !== 0) {
        throw new Error("Selecciona una imagen valida.");
      }

      var ownerUid = safeString(state.uid, "anon");
      var url = await subirImagen(file, ownerUid);

      // Verificacion final para evitar URL vacia.
      if (!safeString(url, "")) {
        throw new Error("No se obtuvo URL de imagen.");
      }

      return url;
    }

    // Guarda cambios del perfil del usuario actual.
    async function saveProfileChanges(event) {
      event.preventDefault();

      // Proteccion por si no hay sesion.
      if (!state.uid) {
        showToast("Debes iniciar sesion para editar perfil.", "error");
        return;
      }

      // Lectura y sanitizacion de texto.
      var skill = safeString(ui.profileSkill.value, "");
      var hours = safeString(ui.profileHours.value, "");
      var photoFile = ui.profilePhoto.files && ui.profilePhoto.files[0] ? ui.profilePhoto.files[0] : null;

      // Validaciones de longitud para evitar payloads excesivos.
      if (skill.length > 140 || hours.length > 140) {
        showToast("Habilidades y disponibilidad deben tener maximo 140 caracteres.", "error");
        return;
      }

      // URL inicial de foto existente (si hay).
      var photoUrl = state.myProfile ? safeImageUrl(state.myProfile.photo) : DEFAULT_AVATAR;

      try {
        setLoading(true, "Guardando perfil...");

        // Si hay nueva foto, se sube primero a Storage.
        if (photoFile) {
          if (photoFile.size > PROFILE_MAX_BYTES) {
            throw new Error("La foto de perfil supera 5MB.");
          }
          var profilePath = "profiles/" + state.uid + "/" + Date.now() + "_" + sanitizeFileName(photoFile.name);
          photoUrl = await uploadImageToStorage(photoFile, profilePath);
        }

        // Actualizacion de documento users/<uid>.
        await db.collection("users").doc(state.uid).set(
          {
            uid: state.uid,
            email: safeString(state.authUser ? state.authUser.email : "", "sin-correo@local"),
            photo: safeImageUrl(photoUrl),
            skill: skill,
            hours: hours,
            credits: state.myProfile ? Math.max(0, safeInt(state.myProfile.credits, 5)) : 5,
            rating: state.myProfile ? clamp(safeNumber(state.myProfile.rating, 5), 0, 5) : 5,
            reviews: state.myProfile ? Math.max(0, safeInt(state.myProfile.reviews, 0)) : 0
          },
          { merge: true }
        );

        // Limpieza de input file para evitar reenvios involuntarios.
        ui.profilePhoto.value = "";
        showToast("Perfil actualizado correctamente.", "success");
      } catch (error) {
        showToast(parseFirebaseError(error), "error");
      } finally {
        setLoading(false);
      }
    }

    // ==============================
    // 10) BUSCADOR DE USUARIOS
    // ==============================

    // Suscribe lista de usuarios para buscador y lista de chat.
    function subscribeUsers() {
      stopListener("users");

      // Consulta simple para evitar requerir indices extra.
      var usersQuery = db.collection("users").limit(500);

      unsubscribers.users = usersQuery.onSnapshot(
        function (snapshot) {
          // Reinicia cache y vuelve a cargar con datos limpios.
          state.usersMap.clear();

          snapshot.forEach(function (doc) {
            var normalized = normalizeUserDoc(doc.data(), null);
            state.usersMap.set(doc.id, normalized);
          });

          // Renderiza buscador y contactos de chat.
          renderSearchResults();
          renderChatUsers();
        },
        function (error) {
          showToast(parseFirebaseError(error), "error");
        }
      );
    }

    // Renderiza cards de usuarios filtrando por habilidad/correo.
    function renderSearchResults() {
      var allUsers = Array.from(state.usersMap.entries())
        .filter(function (entry) {
          return entry[0] !== state.uid;
        })
        .map(function (entry) {
          var uid = entry[0];
          var user = entry[1];
          return {
            uid: uid,
            email: safeString(user.email, "sin-correo@local"),
            photo: safeImageUrl(user.photo),
            skill: safeString(user.skill, "Sin habilidades registradas"),
            hours: safeString(user.hours, "Sin disponibilidad registrada"),
            rating: clamp(safeNumber(user.rating, 5), 0, 5),
            reviews: Math.max(0, safeInt(user.reviews, 0))
          };
        });

      var term = safeString(state.searchTerm, "").toLowerCase();

      var filtered = allUsers.filter(function (user) {
        var skillMatch = user.skill.toLowerCase().indexOf(term) !== -1;
        var emailMatch = user.email.toLowerCase().indexOf(term) !== -1;
        if (!term) {
          return true;
        }
        return skillMatch || emailMatch;
      });

      if (filtered.length === 0) {
        ui.searchResults.innerHTML = ""
          + "<div class=\"glass rounded-2xl p-5 border border-slate-700/35 text-slate-300\">"
          + "No hay usuarios que coincidan con tu busqueda."
          + "</div>";
        return;
      }

      ui.searchResults.innerHTML = filtered
        .map(function (user) {
          return ""
            + "<article data-user-card data-user-id=\"" + escapeAttr(user.uid) + "\" class=\"glass rounded-2xl p-4 border border-slate-700/35\">"
            + "  <div class=\"flex gap-3\">"
            + "    <img"
            + "      src=\"" + escapeAttr(user.photo) + "\""
            + "      alt=\"avatar\""
            + "      class=\"w-14 h-14 rounded-xl object-cover border border-slate-600\""
            + "      onerror=\"this.onerror=null;this.src='" + escapeAttr(DEFAULT_AVATAR) + "';\""
            + "    />"
            + "    <div class=\"min-w-0\">"
            + "      <p class=\"font-semibold truncate\">" + escapeHtml(user.email) + "</p>"
            + "      <p class=\"text-sm text-slate-300 mt-1\">" + escapeHtml(user.skill) + "</p>"
            + "      <p class=\"text-xs text-slate-400 mt-1\">Disponibilidad: " + escapeHtml(user.hours) + "</p>"
            + "      <p class=\"text-xs text-amber-300 mt-1\">Rating: " + escapeHtml(formatRating(user.rating)) + " (" + escapeHtml(String(user.reviews)) + " reviews)</p>"
            + "    </div>"
            + "  </div>"
            + ""
            + "  <div class=\"mt-4 grid gap-3\">"
            + "    <button data-action=\"chat\" class=\"rounded-xl bg-sky-600 hover:bg-sky-500 transition px-3 py-2 text-sm font-medium\">Contactar</button>"
            + ""
            + "    <div class=\"grid sm:grid-cols-[1fr_auto] gap-2\">"
            + "      <input"
            + "        data-credit-input"
            + "        type=\"number\""
            + "        min=\"1\""
            + "        step=\"1\""
            + "        class=\"rounded-xl bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500\""
            + "        placeholder=\"Creditos a transferir\""
            + "      />"
            + "      <button data-action=\"transfer\" class=\"rounded-xl bg-emerald-600 hover:bg-emerald-500 transition px-3 py-2 text-sm font-medium\">Enviar</button>"
            + "    </div>"
            + ""
            + "    <div class=\"grid sm:grid-cols-[1fr_auto] gap-2\">"
            + "      <select data-rating-select class=\"rounded-xl bg-slate-900/70 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500\">"
            + "        <option value=\"5\">5 - Excelente</option>"
            + "        <option value=\"4\">4 - Muy bueno</option>"
            + "        <option value=\"3\">3 - Bueno</option>"
            + "        <option value=\"2\">2 - Regular</option>"
            + "        <option value=\"1\">1 - Bajo</option>"
            + "      </select>"
            + "      <button data-action=\"rate\" class=\"rounded-xl bg-amber-600 hover:bg-amber-500 transition px-3 py-2 text-sm font-medium\">Calificar</button>"
            + "    </div>"
            + "  </div>"
            + "</article>";
        })
        .join("");
    }

    // Maneja acciones de botones dentro del buscador (event delegation).
    async function handleSearchActions(event) {
      var button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      var card = button.closest("[data-user-card]");
      if (!card) {
        return;
      }

      var targetUid = safeString(card.getAttribute("data-user-id"), "");
      if (!targetUid) {
        showToast("No se encontro el usuario destino.", "error");
        return;
      }

      var action = safeString(button.getAttribute("data-action"), "");

      // Accion "chat": abre chat privado con ese usuario.
      if (action === "chat") {
        openChatWithUser(targetUid);
        return;
      }

      // Accion "transfer": transfiere creditos con validaciones.
      if (action === "transfer") {
        var amountInput = card.querySelector("input[data-credit-input]");
        var amountValue = amountInput ? safeInt(amountInput.value, 0) : 0;
        await transferCredits(targetUid, amountValue);
        if (amountInput) {
          amountInput.value = "";
        }
        return;
      }

      // Accion "rate": actualiza rating promedio del usuario destino.
      if (action === "rate") {
        var ratingSelect = card.querySelector("select[data-rating-select]");
        var score = ratingSelect ? safeInt(ratingSelect.value, 0) : 0;
        await rateUser(targetUid, score);
      }
    }

    // ==============================
    // 11) CREDITOS E HISTORIAL
    // ==============================

    // Transfiere creditos entre usuarios con transaccion atomica.
    async function transferCredits(toUid, amount) {
      // Validaciones de entrada.
      if (!state.uid) {
        showToast("Debes iniciar sesion para transferir creditos.", "error");
        return;
      }
      if (toUid === state.uid) {
        showToast("No puedes transferirte creditos a ti mismo.", "error");
        return;
      }
      if (!Number.isInteger(amount) || amount <= 0) {
        showToast("Ingresa una cantidad valida (entero mayor que 0).", "error");
        return;
      }

      var senderRef = db.collection("users").doc(state.uid);
      var receiverRef = db.collection("users").doc(toUid);
      var historyRef = db.collection("history").doc();

      try {
        setLoading(true, "Transfiriendo creditos...");

        await db.runTransaction(async function (tx) {
          // Leer saldo del emisor.
          var senderSnap = await tx.get(senderRef);
          if (!senderSnap.exists) {
            throw new Error("No existe perfil emisor.");
          }

          // Leer datos del receptor.
          var receiverSnap = await tx.get(receiverRef);
          if (!receiverSnap.exists) {
            throw new Error("No existe perfil receptor.");
          }

          // Normalizar datos para evitar undefined.
          var sender = normalizeUserDoc(senderSnap.data(), state.authUser);
          var receiver = normalizeUserDoc(receiverSnap.data(), null);

          // Validar saldo disponible.
          if (sender.credits < amount) {
            throw new Error("Saldo insuficiente para completar la transferencia.");
          }

          // Aplicar debito y credito.
          tx.update(senderRef, { credits: sender.credits - amount });
          tx.update(receiverRef, { credits: receiver.credits + amount });

          // Registrar historial de forma atomica dentro de la misma transaccion.
          tx.set(historyRef, {
            from: state.uid,
            to: toUid,
            amount: amount,
            time: Date.now()
          });
        });

        showToast("Transferencia realizada correctamente.", "success");
      } catch (error) {
        showToast(parseFirebaseError(error), "error");
      } finally {
        setLoading(false);
      }
    }

    // Suscribe historial filtrando solo transferencias del usuario actual.
    function subscribeHistory() {
      stopListener("historyFrom");
      stopListener("historyTo");
      state.historyFromDocs = [];
      state.historyToDocs = [];

      if (!state.uid) {
        renderHistory();
        return;
      }

      // Query 1: transferencias enviadas.
      unsubscribers.historyFrom = db.collection("history")
        .where("from", "==", state.uid)
        .limit(500)
        .onSnapshot(
          function (snapshot) {
            state.historyFromDocs = snapshot.docs.map(function (doc) {
              return normalizeHistoryDoc(doc.id, doc.data());
            });
            renderHistory();
          },
          function (error) {
            showToast(parseFirebaseError(error), "error");
          }
        );

      // Query 2: transferencias recibidas.
      unsubscribers.historyTo = db.collection("history")
        .where("to", "==", state.uid)
        .limit(500)
        .onSnapshot(
          function (snapshot) {
            state.historyToDocs = snapshot.docs.map(function (doc) {
              return normalizeHistoryDoc(doc.id, doc.data());
            });
            renderHistory();
          },
          function (error) {
            showToast(parseFirebaseError(error), "error");
          }
        );
    }

    // Renderiza historial combinado y ordenado por fecha desc.
    function renderHistory() {
      // Unificamos docs y removemos duplicados por id.
      var all = state.historyFromDocs.concat(state.historyToDocs);
      var map = new Map();
      all.forEach(function (item) {
        map.set(item.id, item);
      });
      var unique = Array.from(map.values());

      // Orden descendente por tiempo.
      unique.sort(function (a, b) {
        return b.time - a.time;
      });

      if (unique.length === 0) {
        ui.historyList.innerHTML = ""
          + "<div class=\"glass rounded-xl p-4 border border-slate-700/35 text-slate-300\">"
          + "Aun no tienes movimientos de creditos."
          + "</div>";
        return;
      }

      ui.historyList.innerHTML = unique
        .map(function (item) {
          var isSent = item.from === state.uid;
          var otherUid = isSent ? item.to : item.from;
          var otherUser = state.usersMap.get(otherUid);
          var otherEmail = otherUser ? safeString(otherUser.email, otherUid) : otherUid;
          var badgeClass = isSent
            ? "bg-rose-600/20 text-rose-200 border-rose-500/30"
            : "bg-emerald-600/20 text-emerald-200 border-emerald-500/30";
          var badgeText = isSent ? "Enviado" : "Recibido";
          return ""
            + "<div class=\"glass rounded-xl p-4 border border-slate-700/35\">"
            + "  <div class=\"flex flex-wrap items-center gap-2\">"
            + "    <span class=\"text-xs px-2 py-1 rounded-full border " + badgeClass + "\">" + escapeHtml(badgeText) + "</span>"
            + "    <span class=\"text-sm text-slate-300\">"
            + "      " + (isSent ? "Para" : "De") + ": " + escapeHtml(otherEmail)
            + "    </span>"
            + "  </div>"
            + "  <p class=\"mt-2 font-semibold\">Creditos: " + escapeHtml(String(item.amount)) + "</p>"
            + "  <p class=\"text-xs text-slate-400 mt-1\">Fecha: " + escapeHtml(formatDateTime(item.time)) + "</p>"
            + "</div>";
        })
        .join("");
    }

    // ==============================
    // 12) CALIFICACIONES
    // ==============================

    // Permite calificar usuarios y recalcula promedio + reviews.
    async function rateUser(targetUid, score) {
      // Validaciones de seguridad.
      if (!state.uid) {
        showToast("Debes iniciar sesion para calificar.", "error");
        return;
      }
      if (targetUid === state.uid) {
        showToast("No puedes calificarte a ti mismo.", "error");
        return;
      }
      if (!Number.isInteger(score) || score < 1 || score > 5) {
        showToast("Selecciona un puntaje entre 1 y 5.", "error");
        return;
      }

      var targetRef = db.collection("users").doc(targetUid);

      try {
        setLoading(true, "Enviando calificacion...");

        await db.runTransaction(async function (tx) {
          var targetSnap = await tx.get(targetRef);
          if (!targetSnap.exists) {
            throw new Error("No existe el usuario a calificar.");
          }

          var target = normalizeUserDoc(targetSnap.data(), null);
          var currentReviews = Math.max(0, safeInt(target.reviews, 0));
          var currentRating = clamp(safeNumber(target.rating, 5), 0, 5);

          // Formula de promedio ponderado.
          var nextReviews = currentReviews + 1;
          var nextRating = ((currentRating * currentReviews) + score) / nextReviews;

          tx.update(targetRef, {
            rating: clamp(nextRating, 0, 5),
            reviews: nextReviews
          });
        });

        showToast("Calificacion registrada.", "success");
      } catch (error) {
        showToast(parseFirebaseError(error), "error");
      } finally {
        setLoading(false);
      }
    }

    // ==============================
    // 13) SERVICIOS CRONOMETRADOS
    // ==============================

    // Inicia un servicio en el chat activo. Quien lo inicia se vuelve cliente.
    async function startService() {
      // Validamos que exista un chat activo.
      if (!state.uid || !state.activeChatUserId || !state.activeChatId) {
        showToast("Selecciona un chat antes de iniciar un servicio.", "error");
        return;
      }

      // Referencia unica por chat para impedir timers simultaneos.
      var serviceRef = db.collection("services").doc(state.activeChatId);

      try {
        setLoading(true, "Iniciando servicio...");

        await db.runTransaction(async function (tx) {
          // Leemos el documento actual del servicio del chat.
          var serviceSnap = await tx.get(serviceRef);
          var current = serviceSnap.exists ? (serviceSnap.data() || {}) : {};

          // Si ya existe uno activo, bloqueamos un segundo inicio.
          if (safeString(current.status, "") === "active") {
            throw new Error("Ya existe un servicio activo en este chat.");
          }

          // Registramos el inicio del servicio con el usuario actual como cliente.
          tx.set(serviceRef, {
            chatId: state.activeChatId,
            clientId: state.uid,
            providerId: state.activeChatUserId,
            startTime: Date.now(),
            endTime: 0,
            duration: 0,
            creditsGiven: 0,
            status: "active"
          }, { merge: true });
        });

        showToast("Servicio iniciado. El cronometro ya esta corriendo.", "success");
      } catch (error) {
        showToast(parseFirebaseError(error), "error");
      } finally {
        setLoading(false);
      }
    }

    // Detiene el servicio activo, calcula creditos y liquida con transaccion segura.
    async function stopService() {
      // Validamos el contexto antes de ejecutar la liquidacion.
      if (!state.uid || !state.activeChatUserId || !state.activeChatId) {
        showToast("Selecciona un chat con servicio activo.", "error");
        return;
      }

      var serviceRef = db.collection("services").doc(state.activeChatId);
      var clientRef = db.collection("users").doc(state.uid);
      var providerRef = db.collection("users").doc(state.activeChatUserId);
      var historyRef = db.collection("history").doc();

      try {
        setLoading(true, "Deteniendo servicio...");

        await db.runTransaction(async function (tx) {
          // Cargamos el servicio activo del chat.
          var serviceSnap = await tx.get(serviceRef);
          if (!serviceSnap.exists) {
            throw new Error("No existe un servicio activo para este chat.");
          }

          var serviceData = serviceSnap.data() || {};
          var status = safeString(serviceData.status, "");
          var clientId = safeString(serviceData.clientId, "");
          var providerId = safeString(serviceData.providerId, "");
          var startTime = Math.max(0, safeInt(serviceData.startTime, 0));

          // Solo el cliente puede detener el servicio.
          if (clientId !== state.uid) {
            throw new Error("Solo el cliente que inicio el servicio puede detenerlo.");
          }

          // Si ya fue cerrado, evitamos doble cobro.
          if (status !== "active") {
            throw new Error("Este servicio ya fue finalizado anteriormente.");
          }

          // Calculamos duracion real y creditos segun la formula solicitada.
          var endTime = Date.now();
          var duration = Math.max(0, endTime - startTime);
          var durationInMinutes = Math.floor(duration / 60000);
          var creditsGiven = Math.floor(durationInMinutes / 30);

          // Leemos ambos perfiles para la transferencia.
          var clientSnap = await tx.get(clientRef);
          var providerSnap = await tx.get(providerRef);

          if (!clientSnap.exists || !providerSnap.exists) {
            throw new Error("No se pudieron cargar los perfiles implicados.");
          }

          var client = normalizeUserDoc(clientSnap.data(), state.authUser);
          var provider = normalizeUserDoc(providerSnap.data(), null);

          // Evitamos creditos negativos cuando el servicio ya genero consumo.
          if (creditsGiven > 0 && client.credits < creditsGiven) {
            throw new Error("El cliente no tiene creditos suficientes para cerrar este servicio.");
          }

          // Ajuste atomico de creditos para cliente y proveedor.
          tx.update(clientRef, {
            credits: client.credits - creditsGiven
          });

          tx.update(providerRef, {
            credits: provider.credits + creditsGiven
          });

          // Marcamos el servicio como terminado para impedir duplicados.
          tx.update(serviceRef, {
            endTime: endTime,
            duration: duration,
            creditsGiven: creditsGiven,
            status: "completed"
          });

          // Escribimos historial compatible con el render previo y con el nuevo formato.
          tx.set(historyRef, {
            from: clientId,
            to: providerId,
            amount: creditsGiven,
            credits: creditsGiven,
            duration: duration,
            time: endTime,
            timestamp: endTime
          });
        });

        showToast("Servicio finalizado y creditos transferidos correctamente.", "success");
      } catch (error) {
        showToast(parseFirebaseError(error), "error");
      } finally {
        setLoading(false);
      }
    }

    // Actualiza la UI del cronometro y del panel de servicios en tiempo real.
    function updateTimerUI() {
      // Valores por defecto cuando no existe chat seleccionado.
      var timerText = "00:00:00";
      var roleText = "Sin servicio activo";
      var statusText = state.activeChatId ? "Listo para iniciar" : "Selecciona un chat";
      var metaText = state.activeChatId
        ? "Si inicias el servicio, tu cuenta actuara como cliente y controlara el cronometro."
        : "Abre una conversacion para gestionar servicios por tiempo.";
      var creditsPreview = 0;
      var activeChatLabel = state.activeChatUserId && state.usersMap.get(state.activeChatUserId)
        ? safeString(state.usersMap.get(state.activeChatUserId).email, "Chat activo")
        : "Sin chat seleccionado";
      var canStart = Boolean(state.uid && state.activeChatId && state.activeChatUserId);
      var canStop = false;

      // Si existe documento de servicio asociado al chat activo, lo reflejamos en UI.
      if (serviceRuntime.doc && state.activeChatId === serviceRuntime.boundChatId) {
        var serviceData = serviceRuntime.doc || {};
        var serviceStatus = safeString(serviceData.status, "");
        var clientId = safeString(serviceData.clientId, "");
        var providerId = safeString(serviceData.providerId, "");
        var startTime = Math.max(0, safeInt(serviceData.startTime, 0));
        var storedDuration = Math.max(0, safeInt(serviceData.duration, 0));
        var activeDuration = serviceStatus === "active" ? Math.max(0, Date.now() - startTime) : storedDuration;
        var totalSeconds = Math.floor(activeDuration / 1000);
        var hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
        var minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
        var seconds = String(totalSeconds % 60).padStart(2, "0");

        timerText = hours + ":" + minutes + ":" + seconds;
        creditsPreview = Math.floor(Math.floor(activeDuration / 60000) / 30);
        canStart = serviceStatus !== "active" && Boolean(state.activeChatId);
        canStop = serviceStatus === "active" && clientId === state.uid;

        // Determinamos rol visible del usuario actual.
        if (serviceStatus === "active") {
          if (clientId === state.uid) {
            roleText = "Cliente controlando";
          } else if (providerId === state.uid) {
            roleText = "Proveedor en servicio";
          } else {
            roleText = "Servicio activo";
          }
          statusText = "Servicio activo";
          metaText = "Cronometro corriendo. El cobro se calcula cada 30 minutos completos.";
        } else {
          roleText = "Servicio finalizado";
          statusText = "Servicio completado";
          metaText = "Ultima duracion registrada: " + timerText + ". Puedes iniciar un nuevo servicio en este chat.";
        }
      }

      // Refrescamos los componentes del chat.
      ui.serviceTimer.textContent = timerText;
      ui.serviceRoleBadge.textContent = roleText;
      ui.serviceStateText.textContent = statusText;
      ui.serviceCreditsPreview.textContent = String(Math.max(0, creditsPreview));
      ui.btnStartService.disabled = !canStart || (serviceRuntime.doc && safeString(serviceRuntime.doc.status, "") === "active");
      ui.btnStopService.disabled = !canStop;

      // Refrescamos tambien el panel de la seccion Servicios.
      ui.servicesActiveChat.textContent = activeChatLabel;
      ui.servicesLiveDuration.textContent = timerText;
      ui.servicesLiveCredits.textContent = String(Math.max(0, creditsPreview));
      ui.servicesLiveStatus.textContent = statusText;
      ui.servicesLiveMeta.textContent = metaText;
    }

    // ==============================
    // 13) CHAT PRIVADO TIPO WHATSAPP
    // ==============================

    // Renderiza lista de contactos para abrir chat.
    function renderChatUsers() {
      var users = Array.from(state.usersMap.entries())
        .filter(function (entry) {
          return entry[0] !== state.uid;
        })
        .map(function (entry) {
          return {
            uid: entry[0],
            user: entry[1]
          };
        });

      if (users.length === 0) {
        ui.chatUsersList.innerHTML = ""
          + "<div class=\"text-sm text-slate-400\">No hay otros usuarios registrados.</div>";
        return;
      }

      ui.chatUsersList.innerHTML = users
        .map(function (item) {
          var user = normalizeUserDoc(item.user, null);
          var isActive = item.uid === state.activeChatUserId;
          var activeClass = isActive ? "border-sky-500/60 bg-sky-600/10" : "border-slate-700/40 hover:border-slate-500";
          return ""
            + "<button"
            + "  type=\"button\""
            + "  data-open-chat=\"" + escapeAttr(item.uid) + "\""
            + "  class=\"w-full text-left rounded-xl border " + activeClass + " p-3 transition\""
            + ">"
            + "  <div class=\"flex items-center gap-3\">"
            + "    <img"
            + "      src=\"" + escapeAttr(safeImageUrl(user.photo)) + "\""
            + "      alt=\"avatar\""
            + "      class=\"w-10 h-10 rounded-full object-cover border border-slate-600\""
            + "      onerror=\"this.onerror=null;this.src='" + escapeAttr(DEFAULT_AVATAR) + "';\""
            + "    />"
            + "    <div class=\"min-w-0\">"
            + "      <p class=\"font-medium truncate\">" + escapeHtml(user.email) + "</p>"
            + "      <p class=\"text-xs text-slate-400 truncate\">" + escapeHtml(user.skill) + "</p>"
            + "    </div>"
            + "  </div>"
            + "</button>";
        })
        .join("");
    }

    // Abre chat con un usuario y crea chatId unico.
    function openChatWithUser(otherUid) {
      // Validaciones de seguridad.
      if (!state.uid || !otherUid || otherUid === state.uid) {
        return;
      }

      // Guardamos usuario objetivo y chatId unico por par.
      state.activeChatUserId = otherUid;
      state.activeChatId = buildChatId(state.uid, otherUid);

      // Cambiamos seccion a chat para UX inmediata.
      setActiveSection("chat");

      // Tomamos datos del usuario destino para cabecera.
      var target = state.usersMap.get(otherUid);
      var normalizedTarget = normalizeUserDoc(target || {}, null);
      ui.chatHeaderName.textContent = normalizedTarget.email;
      ui.chatHeaderPhoto.src = safeImageUrl(normalizedTarget.photo);
      ui.chatHeaderPhoto.onerror = function () {
        ui.chatHeaderPhoto.src = DEFAULT_AVATAR;
      };

      // Re-render contactos para resaltar activo.
      renderChatUsers();

      // Suscribir mensajes de ese chat privado.
      subscribeMessagesForActiveChat();
    }

    // Suscribe mensajes de chat activo sin mezclar conversaciones.
    function subscribeMessagesForActiveChat() {
      stopListener("messages");
      if (chatRealtimeChannel) {
        sb.removeChannel(chatRealtimeChannel);
        chatRealtimeChannel = null;
      }
      ui.messagesContainer.innerHTML = "";

      // Si no hay chat seleccionado, no suscribimos nada.
      if (!state.activeChatId || !state.activeChatUserId) {
        return;
      }

      // Query acotada por chatId unico.
      // No usamos orderBy para evitar dependencia de indices compuestos.
      var q = db.collection("messages")
        .where("chatId", "==", state.activeChatId)
        .limit(600);

      async function refreshMessagesSnapshot() {
        var snapshot = await q.get();

        // Normalizamos y filtramos defensivamente.
        var messages = snapshot.docs
          .map(function (doc) {
            return normalizeMessageDoc(doc.id, doc.data());
          })
          .filter(function (msg) {
            return msg.chatId === state.activeChatId;
          });

        // Orden local por tiempo asc.
        messages.sort(function (a, b) {
          return a.time - b.time;
        });

        // Render final de burbujas.
        renderMessages(messages);
      }

      refreshMessagesSnapshot().catch(function (error) {
        showToast(parseFirebaseError(error), "error");
      });

      var channelName = "chat";
      chatRealtimeChannel = sb
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: "chatId=eq." + safeString(state.activeChatId, "")
          },
          function () {
            refreshMessagesSnapshot().catch(function (error) {
              console.error(error);
            });
          }
        )
        .subscribe();

      unsubscribers.messages = function () {
        if (chatRealtimeChannel) {
          sb.removeChannel(chatRealtimeChannel);
          chatRealtimeChannel = null;
        }
      };
    }

    // Renderiza mensajes de la conversacion activa.
    function renderMessages(messages) {
      if (!Array.isArray(messages) || messages.length === 0) {
        ui.messagesContainer.innerHTML = ""
          + "<div class=\"text-sm text-slate-400\">Aun no hay mensajes en esta conversacion.</div>";
        return;
      }

      ui.messagesContainer.innerHTML = messages
        .map(function (msg) {
          var mine = msg.from === state.uid;
          var wrapperClass = mine ? "justify-end" : "justify-start";
          var bubbleClass = mine ? "bubble-me" : "bubble-them";
          var textContent = safeString(msg.text, "");
          var imageUrl = safeString(msg.img, "");
          return ""
            + "<div class=\"flex " + wrapperClass + "\">"
            + "  <div class=\"" + bubbleClass + " max-w-[85%] px-3 py-2 shadow\">"
            + "    " + (textContent ? "<p class=\"whitespace-pre-wrap break-words text-sm\">" + escapeHtml(textContent) + "</p>" : "")
            + "    " + (imageUrl ? "<img src=\"" + escapeAttr(imageUrl) + "\" alt=\"imagen chat\" class=\"mt-2 rounded-lg max-h-64 w-auto border border-slate-600\" onerror=\"this.onerror=null;this.remove();\" />" : "")
            + "    <p class=\"text-[10px] opacity-80 mt-1 text-right\">" + escapeHtml(formatDateTime(msg.time)) + "</p>"
            + "  </div>"
            + "</div>";
        })
        .join("");

      // Auto-scroll al ultimo mensaje tras render.
      window.requestAnimationFrame(function () {
        ui.messagesContainer.scrollTop = ui.messagesContainer.scrollHeight;
      });
    }

    // Envia mensaje (texto y/o imagen) al chat activo.
    async function sendChatMessage(event) {
      event.preventDefault();

      // Validamos que exista chat activo.
      if (!state.uid || !state.activeChatUserId || !state.activeChatId) {
        showToast("Selecciona un contacto antes de enviar.", "error");
        return;
      }

      // Leemos contenido de texto e imagen.
      var text = safeString(ui.chatText.value, "");
      var imageFile = ui.chatImage.files && ui.chatImage.files[0] ? ui.chatImage.files[0] : null;

      // No permitimos mensaje vacio sin imagen.
      if (!text && !imageFile) {
        showToast("Escribe un mensaje o adjunta una imagen.", "error");
        return;
      }

      try {
        setLoading(true, "Enviando mensaje...");

        var imageUrl = "";

        // Si hay imagen, validamos tamano y subimos.
        if (imageFile) {
          if (imageFile.size > CHAT_MAX_BYTES) {
            throw new Error("La imagen del chat supera 10MB.");
          }
          var imagePath = "chat/" + state.activeChatId + "/" + Date.now() + "_" + sanitizeFileName(imageFile.name);
          imageUrl = await uploadImageToStorage(imageFile, imagePath);
        }

        // Guardamos mensaje con campos obligatorios + chatId para aislamiento.
        await db.collection("messages").add({
          from: state.uid,
          to: state.activeChatUserId,
          text: text,
          img: imageUrl,
          time: Date.now(),
          chatId: state.activeChatId
        });

        // Limpieza de formulario de chat.
        ui.chatText.value = "";
        ui.chatImage.value = "";
      } catch (error) {
        showToast(parseFirebaseError(error), "error");
      } finally {
        setLoading(false);
      }
    }

    // ==============================
    // 14) CICLO DE SESION (AUTH STATE)
    // ==============================

    // Reinicia estado y UI para evitar residuos entre usuarios.
    function resetAppStateForSignOut() {
      stopAllListeners();
      state.authUser = null;
      state.uid = "";
      state.myProfile = null;
      state.usersMap = new Map();
      state.activeChatUserId = "";
      state.activeChatId = "";
      state.searchTerm = "";
      state.historyFromDocs = [];
      state.historyToDocs = [];

      ui.profileSummary.innerHTML = "";
      ui.searchResults.innerHTML = "";
      ui.chatUsersList.innerHTML = "";
      ui.messagesContainer.innerHTML = "";
      ui.historyList.innerHTML = "";
      ui.chatHeaderName.textContent = "Selecciona un contacto";
      ui.chatHeaderPhoto.src = DEFAULT_AVATAR;
      ui.sidebarEmail.textContent = "-";
      ui.sidebarCredits.textContent = "0";
      ui.sidebarRating.textContent = "0.0";
      ui.searchSkillInput.value = "";
      ui.chatText.value = "";
      ui.chatImage.value = "";
      ui.profilePhoto.value = "";
      ui.profileSkill.value = "";
      ui.profileHours.value = "";
    }

    // Activa listeners de datos en tiempo real para usuario autenticado.
    function startRealtimeData() {
      subscribeMyProfile();
      subscribeUsers();
      subscribeHistory();
    }

    // Callback principal de cambios de autenticacion.
    auth.onAuthStateChanged(async function (user) {
      // Si no hay usuario, mostramos pantalla auth limpia.
      if (!user) {
        resetAppStateForSignOut();
        ui.appSection.classList.add("hidden");
        ui.authSection.classList.remove("hidden");
        return;
      }

      try {
        setLoading(true, "Cargando tu cuenta...");

        // Guardamos datos base de sesion.
        state.authUser = user;
        state.uid = user.uid;

        // Garantiza existencia y formato de documento users/<uid>.
        await ensureUserDoc(user);

        // Cambia UI a modo autenticado.
        ui.authSection.classList.add("hidden");
        ui.appSection.classList.remove("hidden");

        // Arranca listeners de perfil, usuarios, historial.
        startRealtimeData();

        // Seccion inicial por defecto.
        setActiveSection("dashboard");
      } catch (error) {
        showToast(parseFirebaseError(error), "error");
      } finally {
        setLoading(false);
      }
    });

    // ==============================
    // 15) BINDING DE EVENTOS UI
    // ==============================

    // Previene submit normal del form de auth.
    ui.authForm.addEventListener("submit", function (event) {
      event.preventDefault();
    });

    // Evento boton login con email.
    ui.btnLoginEmail.addEventListener("click", function () {
      loginWithEmail();
    });

    // Evento boton registro con email.
    ui.btnRegisterEmail.addEventListener("click", function () {
      registerWithEmail();
    });

    // Evento boton login con Google.
    ui.btnLoginGoogle.addEventListener("click", function () {
      loginWithGoogle();
    });

    // Evento cerrar sesion.
    ui.btnLogout.addEventListener("click", function () {
      logoutSession();
    });

    // Evento submit formulario perfil.
    ui.profileForm.addEventListener("submit", function (event) {
      saveProfileChanges(event);
    });

    // Evento de busqueda en tiempo real por habilidad/correo.
    ui.searchSkillInput.addEventListener("input", function (event) {
      state.searchTerm = safeString(event.target.value, "");
      renderSearchResults();
    });

    // Delegacion de acciones de tarjetas de usuario.
    ui.searchResults.addEventListener("click", function (event) {
      handleSearchActions(event);
    });

    // Delegacion click para abrir chat desde lista de contactos.
    ui.chatUsersList.addEventListener("click", function (event) {
      var btn = event.target.closest("button[data-open-chat]");
      if (!btn) {
        return;
      }
      var otherUid = safeString(btn.getAttribute("data-open-chat"), "");
      openChatWithUser(otherUid);
    });

    // Evento enviar mensaje de chat.
    ui.chatForm.addEventListener("submit", function (event) {
      sendChatMessage(event);
    });

    // Boton movil para abrir sidebar.
    ui.btnToggleSidebar.addEventListener("click", function () {
      openMobileSidebar();
    });

    // Overlay movil para cerrar sidebar.
    ui.mobileSidebarOverlay.addEventListener("click", function () {
      closeMobileSidebar();
    });

    // Navegacion por sidebar.
    ui.navButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        var section = safeString(button.getAttribute("data-nav"), "dashboard");
        setActiveSection(section);
      });
    });

    // ==============================
    // 16) ACCESIBILIDAD Y DETALLES
    // ==============================

    // En textarea chat, Enter envia, Shift+Enter agrega salto.
    ui.chatText.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage(event);
      }
    });

    // Cierra sidebar movil al cambiar tamano de pantalla a desktop.
    window.addEventListener("resize", function () {
      if (window.innerWidth >= 768) {
        closeMobileSidebar();
      }
    });

    // Observador no intrusivo para transformar el dashboard en una vista estilo LinkedIn.
    new MutationObserver(function () {
      if (!state.myProfile) {
        ui.sidebarMiniAvatar.src = DEFAULT_AVATAR;
        ui.sidebarMiniName.textContent = "Tu perfil";
        return;
      }

      var p = state.myProfile;
      var stamp = [
        safeString(p.uid, ""),
        safeString(p.email, ""),
        safeString(p.photo, ""),
        safeString(p.skill, ""),
        safeString(p.hours, ""),
        String(safeInt(p.credits, 0)),
        formatRating(p.rating),
        String(safeInt(p.reviews, 0))
      ].join("|");

      // Evitamos rehacer el DOM cuando nada ha cambiado.
      if (serviceRuntime.profileStamp === stamp) {
        return;
      }
      serviceRuntime.profileStamp = stamp;

      var skills = safeString(p.skill, "")
        .split(",")
        .map(function (item) { return safeString(item, ""); })
        .filter(function (item) { return Boolean(item); });

      var skillMarkup = skills.length
        ? skills.map(function (item) {
            return "<span class=\"linkedin-skill-badge rounded-full px-3 py-1 text-xs font-medium\">" + escapeHtml(item) + "</span>";
          }).join("")
        : "<span class=\"linkedin-skill-badge rounded-full px-3 py-1 text-xs font-medium\">Sin habilidades registradas</span>";

      ui.profileSummary.innerHTML = ""
        + "<article class=\"linkedin-profile-card\">"
        + "  <div class=\"linkedin-cover p-6 sm:p-8\">"
        + "    <div class=\"flex flex-col sm:flex-row sm:items-end gap-4\">"
        + "      <img"
        + "        src=\"" + escapeAttr(safeImageUrl(p.photo)) + "\""
        + "        alt=\"perfil\""
        + "        class=\"w-28 h-28 rounded-[1.6rem] object-cover border-4 border-slate-950/80 shadow-xl\""
        + "        onerror=\"this.onerror=null;this.src='" + escapeAttr(DEFAULT_AVATAR) + "';\""
        + "      />"
        + "      <div class=\"min-w-0\">"
        + "        <p class=\"text-sm uppercase tracking-[0.22em] text-sky-100/85\">Banco del Tiempo</p>"
        + "        <h3 class=\"mt-2 text-2xl font-semibold break-all\">" + escapeHtml(p.email) + "</h3>"
        + "        <p class=\"mt-1 text-sm text-slate-200/90\">Disponibilidad: " + escapeHtml(p.hours) + "</p>"
        + "      </div>"
        + "    </div>"
        + "  </div>"
        + "  <div class=\"p-6\">"
        + "    <div class=\"grid sm:grid-cols-3 gap-3\">"
        + "      <div class=\"rounded-2xl border border-slate-700/40 bg-slate-900/60 p-4\">"
        + "        <p class=\"text-xs uppercase tracking-wider text-slate-400\">Rating</p>"
        + "        <p class=\"mt-2 text-xl font-semibold text-amber-300\">" + escapeHtml(formatRating(p.rating)) + " / 5</p>"
        + "      </div>"
        + "      <div class=\"rounded-2xl border border-slate-700/40 bg-slate-900/60 p-4\">"
        + "        <p class=\"text-xs uppercase tracking-wider text-slate-400\">Creditos</p>"
        + "        <p class=\"mt-2 text-xl font-semibold text-emerald-300\">" + escapeHtml(String(p.credits)) + "</p>"
        + "      </div>"
        + "      <div class=\"rounded-2xl border border-slate-700/40 bg-slate-900/60 p-4\">"
        + "        <p class=\"text-xs uppercase tracking-wider text-slate-400\">Reviews</p>"
        + "        <p class=\"mt-2 text-xl font-semibold text-sky-300\">" + escapeHtml(String(p.reviews)) + "</p>"
        + "      </div>"
        + "    </div>"
        + "    <div class=\"mt-5\">"
        + "      <p class=\"text-xs uppercase tracking-wider text-slate-400\">Habilidades</p>"
        + "      <div class=\"mt-3 flex flex-wrap gap-2\">" + skillMarkup + "</div>"
        + "    </div>"
        + "  </div>"
        + "</article>";

      ui.sidebarMiniAvatar.src = safeImageUrl(p.photo);
      ui.sidebarMiniName.textContent = safeString(p.email, "Tu perfil");
    }).observe(ui.profileSummary, { childList: true, subtree: true });

    // Observador no intrusivo para enriquecer el historial con duracion y estilo moderno.
    new MutationObserver(function () {
      var all = state.historyFromDocs.concat(state.historyToDocs);
      var uniqueMap = new Map();

      all.forEach(function (item) {
        uniqueMap.set(item.id, item);
      });

      var list = Array.from(uniqueMap.values()).sort(function (a, b) {
        return b.time - a.time;
      });

      var stamp = list.map(function (item) {
        return [item.id, item.time, item.amount, safeInt(item.duration, 0)].join(":");
      }).join("|");

      if (serviceRuntime.historyStamp === stamp) {
        return;
      }
      serviceRuntime.historyStamp = stamp;

      if (!list.length) {
        ui.historyList.innerHTML = ""
          + "<div class=\"history-enhanced-card rounded-2xl border border-slate-700/35 p-5 text-slate-300\">"
          + "Aun no tienes servicios o transferencias registradas."
          + "</div>";
        return;
      }

      ui.historyList.innerHTML = list.map(function (item) {
        var sent = item.from === state.uid;
        var otherUid = sent ? item.to : item.from;
        var otherUser = state.usersMap.get(otherUid);
        var otherEmail = otherUser ? safeString(otherUser.email, otherUid) : otherUid;
        var durationMs = Math.max(0, safeInt(item.duration, 0));
        var durationSeconds = Math.floor(durationMs / 1000);
        var hours = String(Math.floor(durationSeconds / 3600)).padStart(2, "0");
        var minutes = String(Math.floor((durationSeconds % 3600) / 60)).padStart(2, "0");
        var seconds = String(durationSeconds % 60).padStart(2, "0");
        return ""
          + "<div class=\"history-enhanced-card rounded-2xl border border-slate-700/35 p-4\">"
          + "  <div class=\"flex flex-wrap items-center justify-between gap-3\">"
          + "    <div>"
          + "      <p class=\"text-sm font-semibold\">" + escapeHtml(sent ? "Transferiste a " : "Recibiste de ") + escapeHtml(otherEmail) + "</p>"
          + "      <p class=\"text-xs text-slate-400 mt-1\">" + escapeHtml(formatDateTime(item.time)) + "</p>"
          + "    </div>"
          + "    <span class=\"rounded-full px-3 py-1 text-xs border " + (sent ? "bg-rose-600/15 text-rose-200 border-rose-500/30" : "bg-emerald-600/15 text-emerald-200 border-emerald-500/30") + "\">" + escapeHtml(sent ? "Enviado" : "Recibido") + "</span>"
          + "  </div>"
          + "  <div class=\"mt-4 grid sm:grid-cols-2 gap-3\">"
          + "    <div class=\"rounded-xl bg-slate-900/60 border border-slate-700/40 p-3\">"
          + "      <p class=\"text-[11px] uppercase tracking-wider text-slate-400\">Creditos</p>"
          + "      <p class=\"mt-1 font-semibold text-emerald-300\">" + escapeHtml(String(Math.max(0, safeInt(item.credits, item.amount)))) + "</p>"
          + "    </div>"
          + "    <div class=\"rounded-xl bg-slate-900/60 border border-slate-700/40 p-3\">"
          + "      <p class=\"text-[11px] uppercase tracking-wider text-slate-400\">Duracion</p>"
          + "      <p class=\"mt-1 font-semibold text-sky-300\">" + escapeHtml(hours + ":" + minutes + ":" + seconds) + "</p>"
          + "    </div>"
          + "  </div>"
          + "</div>";
      }).join("");
    }).observe(ui.historyList, { childList: true, subtree: true });

    // Sincronizador no intrusivo para enlazar el documento services/<chatId> al chat activo.
    window.setInterval(function () {
      // Si el chat activo cambia, movemos la suscripcion del servicio sin tocar funciones existentes.
      if (serviceRuntime.boundChatId !== state.activeChatId) {
        if (typeof serviceRuntime.unsubscribe === "function") {
          serviceRuntime.unsubscribe();
        }

        serviceRuntime.unsubscribe = null;
        serviceRuntime.doc = null;
        serviceRuntime.boundChatId = state.activeChatId || "";

        if (serviceRuntime.boundChatId) {
          serviceRuntime.unsubscribe = db.collection("services").doc(serviceRuntime.boundChatId).onSnapshot(
            function (snap) {
              serviceRuntime.doc = snap.exists ? (snap.data() || {}) : null;
              updateTimerUI();
            },
            function (error) {
              showToast(parseFirebaseError(error), "error");
            }
          );
        }
      }

      // Si el usuario sale de sesion, liberamos la suscripcion pendiente.
      if (!state.uid && typeof serviceRuntime.unsubscribe === "function") {
        serviceRuntime.unsubscribe();
        serviceRuntime.unsubscribe = null;
        serviceRuntime.doc = null;
        serviceRuntime.boundChatId = "";
      }

      updateTimerUI();
    }, 1000);

    // Valor inicial de seccion para estado visual coherente.
    setActiveSection("dashboard");
    updateTimerUI();


    // Optimizacion visual no intrusiva para imagenes estaticas y dinamicas.
    (function () {
      function optimizeImage(img) {
        if (!img || img.dataset.perfReady === "1") {
          return;
        }

        // Lazy loading y decodificacion asincrona para reducir bloqueos de UI.
        img.setAttribute("loading", "lazy");
        img.setAttribute("decoding", "async");
        if (!img.getAttribute("fetchpriority")) {
          img.setAttribute("fetchpriority", "low");
        }

        // Clases de placeholder/skeleton mientras carga la imagen real.
        img.classList.add("img-perf");
        img.dataset.perfReady = "1";

        // Valores seguros de render para evitar deformaciones y saltos fuertes.
        if (!img.style.objectFit) {
          img.style.objectFit = "cover";
        }
        if (!img.style.maxWidth) {
          img.style.maxWidth = "100%";
        }
        if (!img.style.height || img.style.height === "auto") {
          img.style.height = img.style.height || "auto";
        }

        function markReady() {
          img.classList.add("img-ready");
        }

        if (img.complete) {
          markReady();
        } else {
          img.addEventListener("load", markReady, { once: true });
          img.addEventListener("error", markReady, { once: true });
        }
      }

      function scanImages(root) {
        if (!root) {
          return;
        }

        if (root.tagName === "IMG") {
          optimizeImage(root);
          return;
        }

        if (root.querySelectorAll) {
          root.querySelectorAll("img").forEach(optimizeImage);
        }
      }

      // Primera pasada en todo el documento.
      scanImages(document);

      // Pasadas siguientes para elementos renderizados en tiempo real (chat/listas).
      var obs = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (node) {
            if (node && node.nodeType === 1) {
              scanImages(node);
            }
          });
        });
      });

      obs.observe(document.body, { childList: true, subtree: true });
    })();

    // ==========================================
    // Capa adicional: GALILEO COINS (silenciosa)
    // ==========================================
    (function () {
      if (window.__galileoCoinsBooted) {
        return;
      }
      window.__galileoCoinsBooted = true;

      async function ensureWallet(userId) {
        var uid = safeString(userId, "");
        if (!uid) {
          return;
        }

        var existing = await sb
          .from("wallets")
          .select("user_id")
          .eq("user_id", uid)
          .maybeSingle();

        if (existing.error) {
          console.error(existing.error);
          return;
        }

        if (!existing.data) {
          var created = await sb
            .from("wallets")
            .insert({
              user_id: uid,
              balance: 0
            });
          if (created.error) {
            console.error(created.error);
          }
        }
      }

      async function getBalance(userId) {
        const { data, error } = await sb
          .from("wallets")
          .select("balance")
          .eq("user_id", userId)
          .single();

        if (error) {
          if (error.code !== "PGRST116") {
            console.error(error);
          }
          return 0;
        }

        return data && Number.isFinite(Number(data.balance)) ? Number(data.balance) : 0;
      }

      async function addCoins(userId, amount, description = "Ingreso") {
        var uid = safeString(userId, "");
        var safeAmount = Math.max(0, safeInt(amount, 0));
        if (!uid || safeAmount <= 0) {
          return;
        }

        await ensureWallet(uid);

        const { error: rpcError } = await sb.rpc("increment_coins", {
          uid: uid,
          amount_value: safeAmount
        });
        if (rpcError) {
          console.error(rpcError);
          return;
        }

        const { error: txError } = await sb.from("transactions").insert({
          user_id: uid,
          type: "earn",
          amount: safeAmount,
          description: safeString(description, "Ingreso")
        });
        if (txError) {
          console.error(txError);
        }
      }

      async function spendCoins(userId, amount, description = "Gasto") {
        var uid = safeString(userId, "");
        var safeAmount = Math.max(0, safeInt(amount, 0));
        if (!uid || safeAmount <= 0) {
          return false;
        }

        await ensureWallet(uid);

        const balance = await getBalance(uid);

        if (balance < safeAmount) {
          return false;
        }

        const { error: rpcError } = await sb.rpc("decrement_coins", {
          uid: uid,
          amount_value: safeAmount
        });
        if (rpcError) {
          console.error(rpcError);
          return false;
        }

        const { error: txError } = await sb.from("transactions").insert({
          user_id: uid,
          type: "spend",
          amount: safeAmount,
          description: safeString(description, "Gasto")
        });
        if (txError) {
          console.error(txError);
        }

        return true;
      }

      async function getTransactions(userId) {
        return await sb
          .from("transactions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
      }

      if (auth && typeof auth.onAuthStateChanged === "function") {
        auth.onAuthStateChanged(function (user) {
          if (!user || !user.uid) {
            return;
          }
          ensureWallet(user.uid).catch(function (error) {
            console.error(error);
          });
        });
      }

      window.getBalance = getBalance;
      window.addCoins = addCoins;
      window.spendCoins = spendCoins;
      window.getTransactions = getTransactions;
      window.ensureWallet = ensureWallet;
    })();


    // ===========================================
    // Capa extra: compresion previa de imagenes
    // ===========================================

    // Funcion nueva solicitada: comprime una imagen usando Canvas API.
    // - Lado maximo: 800px
    // - Mantiene proporcion
    // - Formato JPEG
    // - Calidad: 0.6
    async function comprimirImagen(file) {
      // Si no es imagen valida, devolvemos archivo original sin alterar flujo.
      if (!file || !file.type || file.type.indexOf("image/") !== 0) {
        return file;
      }

      // Cede un frame al navegador para no bloquear UI.
      await new Promise(function (resolve) {
        window.requestAnimationFrame(function () { resolve(); });
      });

      // Carga de imagen con createImageBitmap (mas eficiente) y fallback a <img>.
      async function loadSourceImage(inputFile) {
        if (typeof window.createImageBitmap === "function") {
          try {
            return await window.createImageBitmap(inputFile);
          } catch (e) {
            // Fallback si createImageBitmap falla en algun navegador.
          }
        }

        return await new Promise(function (resolve, reject) {
          var img = new Image();
          var tmpUrl = URL.createObjectURL(inputFile);
          img.onload = function () {
            URL.revokeObjectURL(tmpUrl);
            resolve(img);
          };
          img.onerror = function () {
            URL.revokeObjectURL(tmpUrl);
            reject(new Error("No se pudo decodificar la imagen para compresion."));
          };
          img.src = tmpUrl;
        });
      }

      var source = await loadSourceImage(file);
      var originalWidth = source.width || source.naturalWidth || 0;
      var originalHeight = source.height || source.naturalHeight || 0;

      // Si no pudimos obtener dimensiones, retornamos archivo original.
      if (!originalWidth || !originalHeight) {
        if (source && typeof source.close === "function") {
          source.close();
        }
        return file;
      }

      // Calculamos escala para limitar el ancho a 800px manteniendo proporcion.
      var maxWidth = 800;
      var scale = Math.min(1, maxWidth / originalWidth);
      var targetWidth = Math.max(1, Math.round(originalWidth * scale));
      var targetHeight = Math.max(1, Math.round(originalHeight * scale));

      // Render en canvas con fondo blanco para formatos con transparencia.
      var canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      var ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

      if (source && typeof source.close === "function") {
        source.close();
      }

      // Convertimos a JPEG comprimido (quality 0.7).
      var compressedBlob = await new Promise(function (resolve, reject) {
        canvas.toBlob(
          function (blob) {
            if (!blob) {
              reject(new Error("No se pudo generar blob comprimido."));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          0.7
        );
      });

      // Normalizamos nombre de salida para extension .jpg.
      var baseName = String(file.name || "image").replace(/\.[^/.]+$/, "");
      var outputName = baseName + ".jpg";

      // Retornamos File para conservar compatibilidad con ref.put().
      try {
        return new File([compressedBlob], outputName, {
          type: "image/jpeg",
          lastModified: Date.now()
        });
      } catch (e) {
        // Fallback para entornos sin constructor File.
        compressedBlob.name = outputName;
        return compressedBlob;
      }
    }

    (function () {
      // Ejemplo de integracion sin tocar funciones existentes:
      // file -> comprimirImagen(file) -> funcion original de subida.
      if (typeof window.uploadImageToStorage === "function") {
        var originalUploadImageToStorage = window.uploadImageToStorage;

        window.uploadImageToStorage = async function (file, storagePath) {
          var finalFile = file;

          try {
            finalFile = await comprimirImagen(file);
          } catch (error) {
            // Ante error de compresion, seguimos con archivo original.
            if (typeof window.showToast === "function") {
              window.showToast("No se pudo comprimir la imagen. Se subira el archivo original.", "error");
            }
          }

          return originalUploadImageToStorage(finalFile, storagePath);
        };
      }

      // Preview inmediato para mejorar UX sin cambiar flujo existente.
      function bindUploadPreview(inputId, previewId) {
        var input = document.getElementById(inputId);
        var preview = document.getElementById(previewId);
        if (!input || !preview) {
          return;
        }

        var currentUrl = "";

        input.addEventListener("change", function () {
          var file = input.files && input.files[0] ? input.files[0] : null;

          if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
            currentUrl = "";
          }

          if (!file || !file.type || file.type.indexOf("image/") !== 0) {
            preview.innerHTML = "<span>Selecciona una imagen para previsualizar</span>";
            return;
          }

          currentUrl = URL.createObjectURL(file);
          preview.innerHTML =
            "<img src=\"" + currentUrl + "\" alt=\"preview\" loading=\"lazy\" decoding=\"async\" class=\"img-perf img-ready\" />";
        });
      }

      bindUploadPreview("profilePhoto", "profileUploadPreview");
      bindUploadPreview("chatImage", "chatUploadPreview");
    })();


    // ==========================================
    // Capa adicional: marketplace + credit store
    // ==========================================
    (function () {
      if (window.__platformPlusBooted) {
        return;
      }
      window.__platformPlusBooted = true;

      if (!window.db || !window.ui || !window.state) {
        return;
      }

      var marketplaceCatalog = [
        {
          id: "book",
          name: "Libro de Productividad",
          description: "Guia practica para mejorar gestion de tiempo y foco.",
          credits: 5
        },
        {
          id: "course",
          name: "Mini Curso de Liderazgo",
          description: "Contenido corto para potenciar comunicacion y colaboracion.",
          credits: 10
        },
        {
          id: "advisory",
          name: "Asesoria Profesional",
          description: "Sesion 1 a 1 para orientar carrera o proyecto.",
          credits: 15
        }
      ];

      var plusUI = {
        topHeaderSectionTitle: byId("topHeaderSectionTitle"),
        headerUserAvatar: byId("headerUserAvatar"),
        headerUserName: byId("headerUserName"),
        btnNotifBell: byId("btnNotifBell"),
        notifBadgeCount: byId("notifBadgeCount"),
        notifDropdown: byId("notifDropdown"),
        notifDropdownList: byId("notifDropdownList"),
        btnMarkAllNotifsRead: byId("btnMarkAllNotifsRead"),
        btnMarkAllNotifsReadPage: byId("btnMarkAllNotifsReadPage"),
        notificationsPageList: byId("notificationsPageList"),
        sectionBuyCredits: byId("section-buy-credits"),
        buyCreditsCurrentBalance: byId("buyCreditsCurrentBalance"),
        sectionMarketplace: byId("section-marketplace"),
        marketplaceCurrentBalance: byId("marketplaceCurrentBalance"),
        marketplaceList: byId("marketplaceList"),
        transactionsList: byId("transactionsList")
      };

      var plusState = {
        transactions: [],
        notifications: [],
        notificationsOpen: false,
        exchangeSyncStamp: "",
        reviewsStamp: "",
        unsubTransactions: null,
        unsubNotifications: null
      };

      // Extendemos navegacion existente sin tocar estructura base.
      if (ui.sections) {
        ui.sections.buyCredits = byId("section-buy-credits");
        ui.sections.marketplace = byId("section-marketplace");
        ui.sections.notifications = byId("section-notifications");
      }

      function stopPlusListeners() {
        if (typeof plusState.unsubTransactions === "function") {
          plusState.unsubTransactions();
          plusState.unsubTransactions = null;
        }
        if (typeof plusState.unsubNotifications === "function") {
          plusState.unsubNotifications();
          plusState.unsubNotifications = null;
        }
      }

      function shortText(value, maxLen) {
        var text = safeString(value, "");
        var limit = Math.max(6, safeInt(maxLen, 90));
        if (text.length <= limit) {
          return text;
        }
        return text.slice(0, limit - 1) + "...";
      }

      function getStarsMarkup(value) {
        var rating = clamp(safeNumber(value, 0), 0, 5);
        var rounded = Math.round(rating);
        var stars = "";
        for (var i = 1; i <= 5; i += 1) {
          stars += "<span class=\"" + (i <= rounded ? "on" : "off") + "\">&#9733;</span>";
        }
        return "<span class=\"rating-stars\" aria-label=\"rating\">" + stars + "</span>";
      }

      function updateTopHeaderTitle(sectionName) {
        if (!plusUI.topHeaderSectionTitle) {
          return;
        }
        var names = {
          dashboard: "Panel principal",
          search: "Red profesional",
          chat: "Mensajeria privada",
          buyCredits: "Comprar creditos",
          marketplace: "Marketplace",
          history: "Historial",
          notifications: "Notificaciones",
          services: "Servicios por tiempo"
        };
        plusUI.topHeaderSectionTitle.textContent = names[safeString(sectionName, "dashboard")] || "Panel principal";
      }

      function syncReviewsCountForCurrentUser() {
        if (!state.uid || !state.myProfile) {
          return;
        }
        var rating = clamp(safeNumber(state.myProfile.rating, 0), 0, 5);
        var reviews = Math.max(0, safeInt(state.myProfile.reviews, 0));
        var stamp = [state.uid, String(rating), String(reviews)].join("|");
        if (plusState.reviewsStamp === stamp) {
          return;
        }
        plusState.reviewsStamp = stamp;

        db.collection("users").doc(state.uid).set(
          {
            rating: rating,
            reviewsCount: reviews
          },
          { merge: true }
        ).catch(function () {
          // Silencioso para evitar ruido al usuario.
        });
      }

      function decorateProfileReputation() {
        if (!ui.profileSummary || !state.myProfile) {
          return;
        }
        var container = ui.profileSummary.querySelector(".linkedin-profile-card .p-6");
        if (!container) {
          return;
        }
        var target = container.querySelector("[data-plus-profile-stars]");
        var rating = clamp(safeNumber(state.myProfile.rating, 0), 0, 5);
        var reviews = Math.max(0, safeInt(state.myProfile.reviews, 0));
        var markup = getStarsMarkup(rating) + "<span class=\"text-xs text-slate-300\">(" + String(reviews) + " valoraciones)</span>";

        if (!target) {
          target = document.createElement("div");
          target.setAttribute("data-plus-profile-stars", "1");
          target.className = "mt-4 flex items-center gap-2";
          container.appendChild(target);
        }
        target.innerHTML = markup;
      }

      function decorateSearchReputation() {
        if (!ui.searchResults) {
          return;
        }
        var cards = ui.searchResults.querySelectorAll("[data-user-card]");
        cards.forEach(function (card) {
          var ratingLine = card.querySelector("p.text-xs.text-amber-300.mt-1");
          if (!ratingLine) {
            return;
          }
          var text = safeString(ratingLine.textContent, "");
          var match = text.match(/Rating:\s*([0-9.]+)/i);
          if (!match) {
            return;
          }
          var rating = clamp(safeNumber(match[1], 0), 0, 5);
          var starsWrap = card.querySelector("[data-plus-search-stars]");
          if (!starsWrap) {
            starsWrap = document.createElement("div");
            starsWrap.setAttribute("data-plus-search-stars", "1");
            starsWrap.className = "mt-1";
            ratingLine.insertAdjacentElement("afterend", starsWrap);
          }
          starsWrap.innerHTML = getStarsMarkup(rating);
        });
      }

      function syncHeaderProfile() {
        var profile = state.myProfile || normalizeUserDoc({}, state.authUser);
        var currentCredits = Math.max(0, safeInt(profile.credits, 0));
        var photo = safeImageUrl(profile.photo);
        var displayName = safeString(profile.email, "Usuario");

        if (plusUI.headerUserAvatar) {
          plusUI.headerUserAvatar.src = photo;
          plusUI.headerUserAvatar.onerror = function () {
            plusUI.headerUserAvatar.src = DEFAULT_AVATAR;
          };
        }
        if (plusUI.headerUserName) {
          plusUI.headerUserName.textContent = displayName;
        }
        if (plusUI.buyCreditsCurrentBalance) {
          plusUI.buyCreditsCurrentBalance.textContent = String(currentCredits);
        }
        if (plusUI.marketplaceCurrentBalance) {
          plusUI.marketplaceCurrentBalance.textContent = String(currentCredits);
        }

        syncReviewsCountForCurrentUser();
        renderMarketplaceCards();
        decorateProfileReputation();
      }

      function normalizeTransactionDoc(docId, data) {
        var base = data || {};
        return {
          id: docId,
          type: safeString(base.type, "exchange"),
          direction: safeString(base.direction, "in"),
          amount: Math.max(0, safeInt(base.amount, 0)),
          text: safeString(base.text, "Movimiento de creditos"),
          timestamp: Math.max(0, safeInt(base.timestamp, 0)),
          counterpartyUid: safeString(base.counterpartyUid, ""),
          sourceHistoryId: safeString(base.sourceHistoryId, "")
        };
      }

      function normalizeNotificationDoc(docId, data) {
        var base = data || {};
        return {
          id: docId,
          text: safeString(base.text, "Tienes una notificacion."),
          type: safeString(base.type, "info"),
          read: Boolean(base.read),
          timestamp: Math.max(0, safeInt(base.timestamp, 0))
        };
      }

      function openNotificationsDropdown() {
        plusState.notificationsOpen = true;
        if (plusUI.notifDropdown) {
          plusUI.notifDropdown.classList.remove("hidden");
        }
      }

      function closeNotificationsDropdown() {
        plusState.notificationsOpen = false;
        if (plusUI.notifDropdown) {
          plusUI.notifDropdown.classList.add("hidden");
        }
      }

      function renderTransactions() {
        if (!plusUI.transactionsList) {
          return;
        }

        if (!plusState.transactions.length) {
          plusUI.transactionsList.innerHTML = "<div class=\"soft-loader text-sm text-slate-300\">Aun no hay movimientos registrados.</div>";
          return;
        }

        plusUI.transactionsList.innerHTML = plusState.transactions.map(function (item) {
          var incoming = safeString(item.direction, "in") === "in";
          var amountColor = incoming ? "text-emerald-300" : "text-rose-300";
          var badge = incoming ? "Ingreso" : "Egreso";
          var badgeClass = incoming
            ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
            : "bg-rose-500/15 text-rose-200 border-rose-500/30";
          return ""
            + "<article class=\"rounded-2xl border border-slate-700/35 bg-slate-900/50 p-4 lift-card\">"
            + "  <div class=\"flex flex-wrap items-center justify-between gap-2\">"
            + "    <p class=\"font-medium\">" + escapeHtml(item.text) + "</p>"
            + "    <span class=\"rounded-full border px-2.5 py-1 text-xs " + badgeClass + "\">" + escapeHtml(badge) + "</span>"
            + "  </div>"
            + "  <div class=\"mt-3 flex flex-wrap items-center justify-between gap-3\">"
            + "    <p class=\"text-xs text-slate-400\">" + escapeHtml(formatDateTime(item.timestamp)) + "</p>"
            + "    <p class=\"text-lg font-semibold " + amountColor + "\">" + escapeHtml((incoming ? "+" : "-") + String(item.amount)) + " creditos</p>"
            + "  </div>"
            + "</article>";
        }).join("");
      }

      function renderMarketplaceCards() {
        if (!plusUI.marketplaceList) {
          return;
        }

        var credits = state.myProfile ? Math.max(0, safeInt(state.myProfile.credits, 0)) : 0;

        plusUI.marketplaceList.innerHTML = marketplaceCatalog.map(function (item) {
          var canRedeem = credits >= item.credits;
          return ""
            + "<article class=\"market-card rounded-2xl border border-slate-700/35 p-4 lift-card\">"
            + "  <p class=\"text-xs uppercase tracking-wider text-slate-400\">Producto</p>"
            + "  <h3 class=\"mt-2 text-lg font-semibold\">" + escapeHtml(item.name) + "</h3>"
            + "  <p class=\"mt-2 text-sm text-slate-300\">" + escapeHtml(item.description) + "</p>"
            + "  <div class=\"mt-4 flex items-center justify-between gap-2\">"
            + "    <span class=\"rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-sm text-amber-200\">" + escapeHtml(String(item.credits)) + " creditos</span>"
            + "    <button type=\"button\" data-market-item=\"" + escapeAttr(item.id) + "\" class=\"rounded-xl px-3 py-2 text-sm font-medium transition " + (canRedeem ? "bg-sky-600 hover:bg-sky-500" : "bg-slate-700 text-slate-300 cursor-not-allowed") + "\" " + (canRedeem ? "" : "disabled") + ">Canjear</button>"
            + "  </div>"
            + "</article>";
        }).join("");
      }

      function renderNotifications() {
        var unreadCount = plusState.notifications.filter(function (item) { return !item.read; }).length;

        if (plusUI.notifBadgeCount) {
          plusUI.notifBadgeCount.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
          plusUI.notifBadgeCount.classList.toggle("hidden", unreadCount === 0);
        }

        if (plusUI.notifDropdownList) {
          var top = plusState.notifications.slice(0, 6);
          if (!top.length) {
            plusUI.notifDropdownList.innerHTML = "<div class=\"soft-loader text-xs text-slate-300\">No hay notificaciones nuevas.</div>";
          } else {
            plusUI.notifDropdownList.innerHTML = top.map(function (item) {
              return ""
                + "<article class=\"notif-item rounded-xl p-3 " + (item.read ? "" : "notif-unread") + "\">"
                + "  <p class=\"text-sm\">" + escapeHtml(item.text) + "</p>"
                + "  <div class=\"mt-2 flex items-center justify-between gap-2\">"
                + "    <p class=\"text-[11px] text-slate-400\">" + escapeHtml(formatDateTime(item.timestamp)) + "</p>"
                + "    " + (!item.read ? "<button data-mark-notif=\"" + escapeAttr(item.id) + "\" class=\"text-xs rounded-lg border border-slate-600 hover:border-slate-400 px-2 py-1\">Leer</button>" : "") + ""
                + "  </div>"
                + "</article>";
            }).join("");
          }
        }

        if (plusUI.notificationsPageList) {
          if (!plusState.notifications.length) {
            plusUI.notificationsPageList.innerHTML = "<div class=\"soft-loader text-sm text-slate-300\">Aun no tienes alertas registradas.</div>";
            return;
          }

          plusUI.notificationsPageList.innerHTML = plusState.notifications.map(function (item) {
            return ""
              + "<article class=\"notif-item rounded-2xl p-4 " + (item.read ? "" : "notif-unread") + "\">"
              + "  <div class=\"flex items-start justify-between gap-3\">"
              + "    <div>"
              + "      <p class=\"font-medium\">" + escapeHtml(item.text) + "</p>"
              + "      <p class=\"mt-2 text-xs text-slate-400\">" + escapeHtml(formatDateTime(item.timestamp)) + "</p>"
              + "    </div>"
              + "    " + (!item.read ? "<button data-mark-notif=\"" + escapeAttr(item.id) + "\" class=\"rounded-lg border border-slate-600 hover:border-slate-400 px-2.5 py-1 text-xs transition\">Marcar</button>" : "<span class=\"text-xs text-emerald-300\">Leida</span>") + ""
              + "  </div>"
              + "</article>";
          }).join("");
        }
      }

      async function addNotificationForUser(uid, payload, docId) {
        var userId = safeString(uid, "");
        if (!userId) {
          return;
        }

        var basePayload = {
          text: safeString(payload && payload.text, "Tienes una notificacion."),
          type: safeString(payload && payload.type, "info"),
          read: Boolean(payload && payload.read),
          timestamp: Math.max(0, safeInt(payload && payload.timestamp, Date.now()))
        };

        var notifCollection = db.collection("users").doc(userId).collection("notifications");
        if (safeString(docId, "")) {
          var notifDocRef = notifCollection.doc(docId);
          await db.runTransaction(async function (tx) {
            var snap = await tx.get(notifDocRef);
            if (!snap.exists) {
              tx.set(notifDocRef, basePayload);
            }
          });
          return;
        }

        await notifCollection.add(basePayload);
      }

      async function appendTransactionForUser(uid, payload, docId) {
        var userId = safeString(uid, "");
        if (!userId) {
          return;
        }
        var txPayload = {
          type: safeString(payload && payload.type, "exchange"),
          direction: safeString(payload && payload.direction, "in"),
          amount: Math.max(0, safeInt(payload && payload.amount, 0)),
          text: safeString(payload && payload.text, "Movimiento"),
          timestamp: Math.max(0, safeInt(payload && payload.timestamp, Date.now())),
          counterpartyUid: safeString(payload && payload.counterpartyUid, ""),
          sourceHistoryId: safeString(payload && payload.sourceHistoryId, "")
        };

        var txCollection = db.collection("users").doc(userId).collection("transactions");
        if (safeString(docId, "")) {
          await txCollection.doc(docId).set(txPayload, { merge: true });
          return;
        }
        await txCollection.add(txPayload);
      }

      async function markNotificationAsRead(id) {
        var notifId = safeString(id, "");
        if (!state.uid || !notifId) {
          return;
        }
        await db.collection("users").doc(state.uid).collection("notifications").doc(notifId).set(
          { read: true },
          { merge: true }
        );
      }

      async function markAllNotificationsAsRead() {
        if (!state.uid) {
          return;
        }
        var unread = plusState.notifications.filter(function (item) { return !item.read; });
        if (!unread.length) {
          return;
        }

        var batch = db.batch();
        unread.forEach(function (item) {
          var ref = db.collection("users").doc(state.uid).collection("notifications").doc(item.id);
          batch.set(ref, { read: true }, { merge: true });
        });
        await batch.commit();
      }

      async function buyCredits(amount) {
        if (!state.uid) {
          showToast("Debes iniciar sesion para comprar creditos.", "error");
          return;
        }

        var creditsAmount = Math.max(0, safeInt(amount, 0));
        if (!creditsAmount) {
          showToast("Selecciona un paquete valido.", "error");
          return;
        }

        var userRef = db.collection("users").doc(state.uid);
        var creditRef = userRef.collection("credits").doc("balance");
        var transactionRef = userRef.collection("transactions").doc();
        var notificationRef = userRef.collection("notifications").doc();

        try {
          setLoading(true, "Procesando compra simulada...");
          await db.runTransaction(async function (tx) {
            var userSnap = await tx.get(userRef);
            if (!userSnap.exists) {
              throw new Error("No existe perfil para recargar creditos.");
            }
            var userData = normalizeUserDoc(userSnap.data(), state.authUser);
            var nextBalance = userData.credits + creditsAmount;
            var now = Date.now();

            tx.update(userRef, { credits: nextBalance });
            tx.set(creditRef, { credits: nextBalance, updatedAt: now }, { merge: true });
            tx.set(transactionRef, {
              type: "credit_purchase",
              direction: "in",
              amount: creditsAmount,
              text: "Compra simulada de creditos",
              timestamp: now
            });
            tx.set(notificationRef, {
              text: "Compra realizada: +" + String(creditsAmount) + " creditos.",
              type: "credit_purchase",
              read: false,
              timestamp: now
            });
          });
          showToast("Compra simulada completada.", "success");
        } catch (error) {
          showToast(parseFirebaseError(error), "error");
        } finally {
          setLoading(false);
        }
      }

      async function redeemMarketplace(itemId) {
        if (!state.uid) {
          showToast("Debes iniciar sesion para usar el marketplace.", "error");
          return;
        }

        var product = marketplaceCatalog.find(function (item) {
          return item.id === safeString(itemId, "");
        });
        if (!product) {
          showToast("No se encontro ese producto.", "error");
          return;
        }

        var userRef = db.collection("users").doc(state.uid);
        var creditRef = userRef.collection("credits").doc("balance");
        var transactionRef = userRef.collection("transactions").doc();
        var notificationRef = userRef.collection("notifications").doc();

        try {
          setLoading(true, "Canjeando producto...");
          await db.runTransaction(async function (tx) {
            var userSnap = await tx.get(userRef);
            if (!userSnap.exists) {
              throw new Error("No existe perfil para canjear.");
            }

            var userData = normalizeUserDoc(userSnap.data(), state.authUser);
            if (userData.credits < product.credits) {
              throw new Error("No tienes creditos suficientes para este canje.");
            }

            var nextBalance = userData.credits - product.credits;
            var now = Date.now();

            tx.update(userRef, { credits: nextBalance });
            tx.set(creditRef, { credits: nextBalance, updatedAt: now }, { merge: true });
            tx.set(transactionRef, {
              type: "marketplace_purchase",
              direction: "out",
              amount: product.credits,
              text: "Canje de marketplace: " + product.name,
              timestamp: now
            });
            tx.set(notificationRef, {
              text: "Canje realizado: " + product.name + ".",
              type: "marketplace_purchase",
              read: false,
              timestamp: now
            });
          });

          showToast("Canje completado correctamente.", "success");
        } catch (error) {
          showToast(parseFirebaseError(error), "error");
        } finally {
          setLoading(false);
        }
      }

      async function syncExchangeHistoryToTransactions() {
        if (!state.uid) {
          return;
        }

        var all = (state.historyFromDocs || []).concat(state.historyToDocs || []);
        if (!all.length) {
          return;
        }

        var uniqueMap = new Map();
        all.forEach(function (item) {
          uniqueMap.set(item.id, item);
        });
        var list = Array.from(uniqueMap.values());
        list.sort(function (a, b) { return b.time - a.time; });

        var stamp = list.map(function (item) {
          return [safeString(item.id, ""), safeInt(item.time, 0), safeInt(item.amount, 0)].join(":");
        }).join("|");
        if (plusState.exchangeSyncStamp === stamp) {
          return;
        }
        plusState.exchangeSyncStamp = stamp;

        try {
          for (var i = 0; i < list.length; i += 1) {
            var entry = list[i];
            var incoming = safeString(entry.to, "") === state.uid;
            var direction = incoming ? "in" : "out";
            var otherUid = incoming ? safeString(entry.from, "") : safeString(entry.to, "");
            var txDocId = "exchange_" + safeString(entry.id, "") + "_" + direction;
            var notifDocId = "credits_received_" + safeString(entry.id, "");
            var creditsAmount = Math.max(0, safeInt(entry.amount, 0));
            var txTime = Math.max(0, safeInt(entry.time, Date.now()));

            await appendTransactionForUser(state.uid, {
              type: "exchange",
              direction: direction,
              amount: creditsAmount,
              text: incoming ? "Intercambio recibido" : "Intercambio enviado",
              timestamp: txTime,
              counterpartyUid: otherUid,
              sourceHistoryId: safeString(entry.id, "")
            }, txDocId);

            if (incoming) {
              await addNotificationForUser(state.uid, {
                text: "Recibiste " + String(creditsAmount) + " creditos.",
                type: "credits_received",
                read: false,
                timestamp: txTime
              }, notifDocId);
            }
          }
        } catch (error) {
          // Solo registro interno para no bloquear la UX base.
          console.warn("No se pudo sincronizar historial extendido:", error);
        }
      }

      function subscribeTransactionsRealtime() {
        if (!state.uid) {
          plusState.transactions = [];
          renderTransactions();
          return;
        }

        if (typeof plusState.unsubTransactions === "function") {
          plusState.unsubTransactions();
          plusState.unsubTransactions = null;
        }

        plusState.unsubTransactions = db.collection("users").doc(state.uid).collection("transactions")
          .orderBy("timestamp", "desc")
          .limit(250)
          .onSnapshot(
            function (snapshot) {
              plusState.transactions = snapshot.docs.map(function (doc) {
                return normalizeTransactionDoc(doc.id, doc.data());
              });
              renderTransactions();
            },
            function (error) {
              showToast(parseFirebaseError(error), "error");
            }
          );
      }

      function subscribeNotificationsRealtime() {
        if (!state.uid) {
          plusState.notifications = [];
          renderNotifications();
          return;
        }

        if (typeof plusState.unsubNotifications === "function") {
          plusState.unsubNotifications();
          plusState.unsubNotifications = null;
        }

        plusState.unsubNotifications = db.collection("users").doc(state.uid).collection("notifications")
          .orderBy("timestamp", "desc")
          .limit(250)
          .onSnapshot(
            function (snapshot) {
              plusState.notifications = snapshot.docs.map(function (doc) {
                return normalizeNotificationDoc(doc.id, doc.data());
              });
              renderNotifications();
            },
            function (error) {
              showToast(parseFirebaseError(error), "error");
            }
          );
      }

      function startPlusRealtime() {
        stopPlusListeners();
        plusState.transactions = [];
        plusState.notifications = [];
        plusState.exchangeSyncStamp = "";
        renderTransactions();
        renderNotifications();
        subscribeTransactionsRealtime();
        subscribeNotificationsRealtime();
      }

      function resetPlusUIState() {
        plusState.transactions = [];
        plusState.notifications = [];
        plusState.exchangeSyncStamp = "";
        plusState.reviewsStamp = "";
        closeNotificationsDropdown();
        renderTransactions();
        renderNotifications();

        if (plusUI.buyCreditsCurrentBalance) {
          plusUI.buyCreditsCurrentBalance.textContent = "0";
        }
        if (plusUI.marketplaceCurrentBalance) {
          plusUI.marketplaceCurrentBalance.textContent = "0";
        }
        if (plusUI.headerUserName) {
          plusUI.headerUserName.textContent = "Usuario";
        }
        if (plusUI.headerUserAvatar) {
          plusUI.headerUserAvatar.src = DEFAULT_AVATAR;
        }
        renderMarketplaceCards();
      }

      // Wrapper: extiende inicio de tiempo real sin alterar funcion original.
      if (typeof window.startRealtimeData === "function") {
        var originalStartRealtimeData = window.startRealtimeData;
        window.startRealtimeData = function () {
          originalStartRealtimeData();
          startPlusRealtime();
        };
        startRealtimeData = window.startRealtimeData;
      }

      // Wrapper: limpieza extendida al cerrar sesion.
      if (typeof window.resetAppStateForSignOut === "function") {
        var originalResetAppStateForSignOut = window.resetAppStateForSignOut;
        window.resetAppStateForSignOut = function () {
          stopPlusListeners();
          originalResetAppStateForSignOut();
          resetPlusUIState();
        };
        resetAppStateForSignOut = window.resetAppStateForSignOut;
      }

      // Wrapper: sincroniza titulo superior y cierra dropdown al navegar.
      if (typeof window.setActiveSection === "function") {
        var originalSetActiveSection = window.setActiveSection;
        window.setActiveSection = function (sectionName) {
          originalSetActiveSection(sectionName);
          updateTopHeaderTitle(sectionName);
          if (safeString(sectionName, "") !== "notifications") {
            closeNotificationsDropdown();
          }
        };
        setActiveSection = window.setActiveSection;
      }

      // Wrapper: agrega sincronizacion de historial extendido.
      if (typeof window.renderHistory === "function") {
        var originalRenderHistory = window.renderHistory;
        window.renderHistory = function () {
          originalRenderHistory();
          syncExchangeHistoryToTransactions();
        };
        renderHistory = window.renderHistory;
      }

      // Wrapper: reputacion visible en buscador.
      if (typeof window.renderSearchResults === "function") {
        var originalRenderSearchResults = window.renderSearchResults;
        window.renderSearchResults = function () {
          originalRenderSearchResults();
          decorateSearchReputation();
        };
        renderSearchResults = window.renderSearchResults;
      }

      // Wrapper: header + reputacion perfil + saldos.
      if (typeof window.renderProfileDashboard === "function") {
        var originalRenderProfileDashboard = window.renderProfileDashboard;
        window.renderProfileDashboard = function () {
          originalRenderProfileDashboard();
          syncHeaderProfile();
        };
        renderProfileDashboard = window.renderProfileDashboard;
      }

      // Wrapper: al enviar mensaje se registra notificacion al receptor.
      if (typeof window.sendChatMessage === "function") {
        var originalSendChatMessage = window.sendChatMessage;
        window.sendChatMessage = async function (event) {
          var receiverUid = safeString(state.activeChatUserId, "");
          var previewText = safeString(ui.chatText ? ui.chatText.value : "", "");
          var hadImage = Boolean(ui.chatImage && ui.chatImage.files && ui.chatImage.files[0]);

          await originalSendChatMessage(event);

          var wasSent = Boolean(receiverUid && (previewText || hadImage) && ui.chatText && ui.chatText.value === "" && ui.chatImage && ui.chatImage.value === "");
          if (!wasSent) {
            return;
          }

          try {
            await addNotificationForUser(receiverUid, {
              text: previewText ? "Nuevo mensaje: " + shortText(previewText, 85) : "Nuevo mensaje con imagen recibido.",
              type: "new_message",
              read: false,
              timestamp: Date.now()
            });
          } catch (error) {
            // Silencioso para no interrumpir chat.
          }
        };
        sendChatMessage = window.sendChatMessage;
      }

      // Wrapper: al calificar, sincroniza reviewsCount y notifica al perfil calificado.
      if (typeof window.rateUser === "function") {
        var originalRateUser = window.rateUser;
        window.rateUser = async function (targetUid, score) {
          var destinationUid = safeString(targetUid, "");
          var safeScore = safeInt(score, 0);
          var previousTarget = state.usersMap && state.usersMap.get(destinationUid) ? state.usersMap.get(destinationUid) : null;
          var previousReviews = previousTarget ? Math.max(0, safeInt(previousTarget.reviews, 0)) : 0;

          await originalRateUser(targetUid, score);

          if (!destinationUid || destinationUid === state.uid || safeScore < 1 || safeScore > 5) {
            return;
          }

          try {
            var targetSnap = await db.collection("users").doc(destinationUid).get();
            if (!targetSnap.exists) {
              return;
            }
            var targetProfile = normalizeUserDoc(targetSnap.data(), null);
            if (Math.max(0, safeInt(targetProfile.reviews, 0)) <= previousReviews) {
              return;
            }

            await db.collection("users").doc(destinationUid).set(
              {
                rating: clamp(safeNumber(targetProfile.rating, 0), 0, 5),
                reviewsCount: Math.max(0, safeInt(targetProfile.reviews, 0))
              },
              { merge: true }
            );

            await addNotificationForUser(destinationUid, {
              text: "Recibiste una nueva valoracion profesional.",
              type: "rating_received",
              read: false,
              timestamp: Date.now()
            });
          } catch (error) {
            // Silencioso para no romper flujo principal de rating.
          }
        };
        rateUser = window.rateUser;
      }

      // Wrapper: mensaje visible sin formulas internas.
      if (typeof window.updateTimerUI === "function") {
        var originalUpdateTimerUI = window.updateTimerUI;
        window.updateTimerUI = function () {
          originalUpdateTimerUI();
          if (ui.servicesLiveMeta) {
            ui.servicesLiveMeta.textContent = "Los creditos se calculan automaticamente.";
          }
        };
        updateTimerUI = window.updateTimerUI;
      }

      // Binding: dropdown de notificaciones.
      if (plusUI.btnNotifBell) {
        plusUI.btnNotifBell.addEventListener("click", function () {
          if (plusState.notificationsOpen) {
            closeNotificationsDropdown();
          } else {
            openNotificationsDropdown();
          }
        });
      }

      // Binding: marcar todas las notificaciones como leidas.
      function bindMarkAll(button) {
        if (!button) {
          return;
        }
        button.addEventListener("click", async function () {
          try {
            await markAllNotificationsAsRead();
            showToast("Notificaciones marcadas como leidas.", "success");
          } catch (error) {
            showToast(parseFirebaseError(error), "error");
          }
        });
      }
      bindMarkAll(plusUI.btnMarkAllNotifsRead);
      bindMarkAll(plusUI.btnMarkAllNotifsReadPage);

      // Binding: click por item de notificacion (dropdown + pagina).
      function bindNotificationList(listNode) {
        if (!listNode) {
          return;
        }
        listNode.addEventListener("click", async function (event) {
          var btn = event.target.closest("button[data-mark-notif]");
          if (!btn) {
            return;
          }
          var notifId = safeString(btn.getAttribute("data-mark-notif"), "");
          if (!notifId) {
            return;
          }

          try {
            await markNotificationAsRead(notifId);
          } catch (error) {
            showToast(parseFirebaseError(error), "error");
          }
        });
      }
      bindNotificationList(plusUI.notifDropdownList);
      bindNotificationList(plusUI.notificationsPageList);

      // Binding: compras simuladas.
      if (plusUI.sectionBuyCredits) {
        plusUI.sectionBuyCredits.addEventListener("click", function (event) {
          var button = event.target.closest("button[data-buy-credits]");
          if (!button) {
            return;
          }
          var amount = safeInt(button.getAttribute("data-buy-credits"), 0);
          buyCredits(amount);
        });
      }

      // Binding: canje marketplace.
      if (plusUI.marketplaceList) {
        plusUI.marketplaceList.addEventListener("click", function (event) {
          var button = event.target.closest("button[data-market-item]");
          if (!button) {
            return;
          }
          var itemId = safeString(button.getAttribute("data-market-item"), "");
          redeemMarketplace(itemId);
        });
      }

      // Cierre automatico del dropdown al hacer click afuera.
      document.addEventListener("click", function (event) {
        if (!plusState.notificationsOpen) {
          return;
        }
        if (!plusUI.notifDropdown || !plusUI.btnNotifBell) {
          return;
        }
        var clickInsideDropdown = plusUI.notifDropdown.contains(event.target);
        var clickOnBell = plusUI.btnNotifBell.contains(event.target);
        if (!clickInsideDropdown && !clickOnBell) {
          closeNotificationsDropdown();
        }
      });

      renderMarketplaceCards();
      renderTransactions();
      renderNotifications();
      syncHeaderProfile();
      updateTopHeaderTitle(state.activeSection || "dashboard");

      // Si ya hay sesion activa al cargar esta capa, inicia listeners plus.
      if (state.uid) {
        startPlusRealtime();
      }
    })();

