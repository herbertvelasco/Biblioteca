(function () {
  var COMPAT_ENVS = [
    ['Firefox', ">= 16.0"],
    ['Google Chrome',
      ">= 24.0 (you may need to get Google Chrome Canary), NO Blob storage support"]
  ];
  var compat = $('#compat');
  compat.empty();
  compat.append('<ul id="compat-list"></ul>');
  COMPAT_ENVS.forEach(function (val, idx, array) {
    $('#compat-list').append('<li>' + val[0] + ': ' + val[1] + '</li>');
  });
  //nombre y datos de la DB
  const DB_NAME = 'Biblioteca';
  const DB_VERSION = 1; // Use un long long para este valor (no use un flotante)
  const DB_STORE_NAME = 'publications';

  var db;

  // Se usa para realizar un seguimiento de qué vista se muestra para evitar recargarla inútilmente
  var current_view_pub_key;

  function openDb() {
    console.log("openDb ...");
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = function (evt) {
      // Igual a: db = req.result;
      db = this.result;
      console.log("openDb ...DONE...");
    };
    req.onerror = function (evt) {
      console.error("openDb:", evt.target.errorCode);
    };

    req.onupgradeneeded = function (evt) {
      console.log("openDb.onupgradeneeded");
      var store = evt.currentTarget.result.createObjectStore(
        DB_STORE_NAME, { keyPath: 'id', autoIncrement: true });

      store.createIndex('biblioid', 'biblioid', { unique: true });
      store.createIndex('title', 'title', { unique: false });
      store.createIndex('autor', 'autor', { unique: false });
      store.createIndex('year', 'year', { unique: false });

    };
  }

  /** * @param { string } store_name * @param { string } modo "readonly" o "readwrite" */

  function getObjectStore(store_name, mode) {
    var tx = db.transaction(store_name, mode);
    return tx.objectStore(store_name);
  }

  function clearObjectStore() {
    var store = getObjectStore(DB_STORE_NAME, 'readwrite');
    var req = store.clear();
    req.onsuccess = function (evt) {
      displayActionSuccess("Store cleared");
      displayPubList(store);
    };
    req.onerror = function (evt) {
      console.error("clearObjectStore:", evt.target.errorCode);
      displayActionFailure(this.error);
    };
  }

  function getBlob(key, store, success_callback) {
    var req = store.get(key);
    req.onsuccess = function (evt) {
      var value = evt.target.result;
      if (value)
        success_callback(value.blob);
    };
  }

  /** * @param { IDBObjectStore = } tienda */
  function displayPubList(store) {
    console.log("displayPubList");

    if (typeof store == 'undefined')
      store = getObjectStore(DB_STORE_NAME, 'readonly');

    var pub_msg = $('#pub-msg');
    pub_msg.empty();
    var pub_list = $('#pub-list');
    pub_list.empty();

    // Restableciendo el iframe para que no muestre contenido anterior
    newViewerFrame();

    var req;
    req = store.count();

    // Las solicitudes se ejecutan en el orden en que se hicieron contra el
    // transacción, y sus resultados se devuelven en el mismo orden.
    // Por lo tanto, el texto de recuento a continuación se mostrará antes de la lista de pubs real
    // (no es que sea algorítmicamente importante en este caso).

    req.onsuccess = function (evt) {
      pub_msg.append('<p>There are <strong>' + evt.target.result +
        '</strong> record(s) in the object store.</p>');
    };
    req.onerror = function (evt) {
      console.error("add error", this.error);
      displayActionFailure(this.error);
    };

    var i = 0;
    req = store.openCursor();
    req.onsuccess = function (evt) {
      var cursor = evt.target.result;

      // Si el cursor apunta a algo, pide los datos

      if (cursor) {
        console.log("displayPubList cursor:", cursor);
        req = store.get(cursor.key);
        req.onsuccess = function (evt) {
          var value = evt.target.result;
          var list_item = $('<li>' + '[' + cursor.key + '] ' + '(biblioid: ' + value.biblioid + ') ' +  value.title +  '</li>');
          if (value.year != null)
            list_item.append(' - ' + value.year);

          if (value.hasOwnProperty('blob') &&  typeof value.blob != 'undefined') {
            var link = $('<a href="' + cursor.key + '">File</a>');
            link.on('click', function () { return false; });
            link.on('mouseenter', function (evt) {
              setInViewer(evt.target.getAttribute('href'));
            });
            list_item.append(' / ');
            list_item.append(link);
          } else {
            list_item.append(" / No attached file");
          }
          pub_list.append(list_item);
        };

        // Pasar al siguiente objeto en la tienda
        cursor.continue();

        // Este contador solo sirve para crear identificadores distintos
        i++;
      } else {
        console.log("No more entries");
      }
    };
  }

  function newViewerFrame() {
    var viewer = $('#pub-viewer');
    viewer.empty();
    var iframe = $('<iframe />');
    viewer.append(iframe);
    return iframe;
  }

  function setInViewer(key) {
    console.log("setInViewer:", arguments);
    key = Number(key);
    if (key == current_view_pub_key)
      return;

    current_view_pub_key = key;

    var store = getObjectStore(DB_STORE_NAME, 'readonly');
    getBlob(key, store, function (blob) {
      console.log("setInViewer blob:", blob);
      var iframe = newViewerFrame();

      // No es posible establecer un enlace directo al
      // blob para proporcionar un medio para descargarlo directamente.

      if (blob.type == 'text/html') {
        var reader = new FileReader();
        reader.onload = (function (evt) {
          var html = evt.target.result;
          iframe.load(function () {
            $(this).contents().find('html').html(html);
          });
        });
        reader.readAsText(blob);
      } else if (blob.type.indexOf('image/') == 0) {
        iframe.load(function () {
          var img_id = 'image-' + key;
          var img = $('<img id="' + img_id + '"/>');
          $(this).contents().find('body').html(img);
          var obj_url = window.URL.createObjectURL(blob);
          $(this).contents().find('#' + img_id).attr('src', obj_url);
          window.URL.revokeObjectURL(obj_url);
        });
      } else if (blob.type == 'application/pdf') {
        $('*').css('cursor', 'wait');
        var obj_url = window.URL.createObjectURL(blob);
        iframe.load(function () {
          $('*').css('cursor', 'auto');
        });
        iframe.attr('src', obj_url);
        window.URL.revokeObjectURL(obj_url);
      } else {
        iframe.load(function () {
          $(this).contents().find('body').html("No view available");
        });
      }

    });
  }

  /**
   *  * @param { cadena } biblioid * @param { cadena } título * @param { número } año * @param { cadena } url la URL de la imagen para descargar y almacenar en la base de datos local * IndexedDB. El recurso detrás de esta URL está sujeto a la * "Política del mismo origen", por lo tanto, para que este método funcione, la URL debe provenir * del mismo origen que el sitio web / aplicación en el que se implementa este código. */
  function addPublicationFromUrl(biblioid, title, autor, year, url) {
    console.log("addPublicationFromUrl:", arguments);

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    // Estableciendo el tipo de respuesta deseado en "blob"
    // http://www.w3.org/TR/XMLHttpRequest2/#the-response-attribute
    
    xhr.responseType = 'blob';
    xhr.onload = function (evt) {
      if (xhr.status == 200) {
        console.log("Blob retrieved");
        var blob = xhr.response;
        console.log("Blob:", blob);
        addPublication(biblioid, title, autor, year, blob);
      } else {
        console.error("addPublicationFromUrl error:",
          xhr.responseText, xhr.status);
      }
    };
    xhr.send();

    // No podemos usar jQuery aquí porque a partir de jQuery 1.8.3 el nuevo "blob"
    // responseType no se maneja.
    // http://bugs.jquery.com/ticket/11461
    // http://bugs.jquery.com/ticket/7248
    // $.ajax({
    //   url: url,
    // escribe: 'OBTENER',
    //   xhrFields: { responseType: 'blob' },
    // éxito: función (datos, estado de texto, jqXHR) {
    // console.log ("Blob recuperado");
    // console.log ("Blob:", datos);
    // // addPublication (biblioid, título, año, datos);
    //   },
    //   error: function(jqXHR, textStatus, errorThrown) {
    //     console.error(errorThrown);
    // displayActionFailure ("Error durante la recuperación de blob");
    //   }
    // });
  }

  /**
   *  * @param { string } biblioid * @param { string } título * @param { número } año * @param { Blob = } blob */
  function addPublication(biblioid, title, autor, year, blob) {
    console.log("addPublication arguments:", arguments);
    var obj = { biblioid: biblioid, title: title, autor: autor, year: year };
    if (typeof blob != 'undefined')
      obj.blob = blob;

    var store = getObjectStore(DB_STORE_NAME, 'readwrite');
    var req;
    try {
      req = store.add(obj);
    } catch (e) {
      if (e.name == 'DataCloneError')
        displayActionFailure("This engine doesn't know how to clone a Blob, " + "use Firefox");
      throw e;
    }
    req.onsuccess = function (evt) {
      console.log("Insertion in DB successful");
      displayActionSuccess();
      displayPubList(store);
    };
    req.onerror = function () {
      console.error("addPublication error", this.error);
      displayActionFailure(this.error);
    };
  }

  /**
   * @param {string} biblioid
   */
  function deletePublicationFromBib(biblioid) {
    console.log("deletePublication:", arguments);
    var store = getObjectStore(DB_STORE_NAME, 'readwrite');
    var req = store.index('biblioid');
    req.get(biblioid).onsuccess = function (evt) {
      if (typeof evt.target.result == 'undefined') {
        displayActionFailure("No matching record found");
        return;
      }
      deletePublication(evt.target.result.id, store);
    };
    req.onerror = function (evt) {
      console.error("deletePublicationFromBib:", evt.target.errorCode);
    };
  }

  /** * @param { número } clave * @param { IDBObjectStore = } tienda */
  function deletePublication(key, store) {
    console.log("deletePublication:", arguments);

    if (typeof store == 'undefined')
      store = getObjectStore(DB_STORE_NAME, 'readwrite');

    // Según las especificaciones http://www.w3.org/TR/IndexedDB/#object-store-deletion-operation
    // el resultado del algoritmo de la operación de eliminación del almacén de objetos es
    // indefinido, por lo que no es posible saber si algunos registros fueron realmente
    // eliminado mirando el resultado de la solicitud.
    
    var req = store.get(key);
    req.onsuccess = function (evt) {
      var record = evt.target.result;
      console.log("record:", record);
      if (typeof record == 'undefined') {
        displayActionFailure("No matching record found");
        return;
      }

      // Advertencia: Se debe pasar exactamente la misma clave utilizada para la creación
      // la supresión. Si la clave era un Número para la creación, entonces necesita
      // ser un número para su eliminación.

      var deleteReq = store.delete(key);
      deleteReq.onsuccess = function (evt) {
        console.log("evt:", evt);
        console.log("evt.target:", evt.target);
        console.log("evt.target.result:", evt.target.result);
        console.log("delete successful");
        displayActionSuccess("Deletion successful");
        displayPubList(store);
      };
      deleteReq.onerror = function (evt) {
        console.error("deletePublication:", evt.target.errorCode);
      };
    };
    req.onerror = function (evt) {
      console.error("deletePublication:", evt.target.errorCode);
    };
  }

  function displayActionSuccess(msg) {
    msg = typeof msg != 'undefined' ? "Success: " + msg : "Success";
    $('#msg').html('<span class="action-success">' + msg + '</span>');
  }

  function displayActionFailure(msg) {
    msg = typeof msg != 'undefined' ? "Failure: " + msg : "Failure";
    $('#msg').html('<span class="action-failure">' + msg + '</span>');
  }

  function resetActionStatus() {
    console.log("resetActionStatus ...");
    $('#msg').empty();
    console.log("resetActionStatus DONE");
  }

  function addEventListeners() {
    console.log("addEventListeners");

    $('#register-form-reset').click(function (evt) {
      resetActionStatus();
    });

    $('#add-button').click(function (evt) {
      console.log("add ...");
      var title = $('#pub-title').val();
      var biblioid = $('#pub-biblioid').val();
      if (!title || !biblioid) {
        displayActionFailure("Required field(s) missing");
        return;
      }
      var autor = $('#pub-autor').val();
      var biblioid = $('#pub-biblioid').val();
      if (!autor || !biblioid) {
        displayActionFailure("Required field(s) missing");
        return;
      }

      var year = $('#pub-year').val();
      if (year != '') {

        // Mejor use Number.isInteger si el motor tiene EcmaScript 6

        if (isNaN(year)) {
          displayActionFailure("Invalid year");
          return;
        }
        year = Number(year);
      } else {
        year = null;
      }

      var file_input = $('#pub-file');
      var selected_file = file_input.get(0).files[0];
      console.log("selected_file:", selected_file);

      // Mantener una referencia sobre cómo restablecer la entrada del archivo en la interfaz de usuario una vez que
      // tiene su valor, pero en lugar de hacerlo, preferimos usar un tipo de "reinicio"
      // entrada en el formulario HTML.
      //file_input.val(null);
      
      var file_url = $('#pub-file-url').val();
      if (selected_file) {
        addPublication(biblioid, title, autor, year, selected_file);
      } else if (file_url) {
        addPublicationFromUrl(biblioid, title, autor, year, file_url);
      } else {
        addPublication(biblioid, title, autor, year);
      }

    });

    $('#delete-button').click(function (evt) {
      console.log("delete ...");
      var biblioid = $('#pub-biblioid-to-delete').val();
      var key = $('#key-to-delete').val();

      if (biblioid != '') {
        deletePublicationFromBib(biblioid);
      } else if (key != '') {
        // Mejor use Number.isInteger si el motor tiene EcmaScript 6
        if (key == '' || isNaN(key)) {
          displayActionFailure("Invalid key");
          return;
        }
        key = Number(key);
        deletePublication(key);
      }
    });

    $('#clear-store-button').click(function (evt) {
      clearObjectStore();
    });

    var search_button = $('#search-list-button');
    search_button.click(function (evt) {
      displayPubList();
    });

  }

  openDb();
  addEventListeners();

})(); // Expresión de función invocada inmediatamente (IIFE)