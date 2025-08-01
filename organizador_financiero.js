// Unificación del código financiero completo

// ==========================
// Variables Globales
// ==========================
let mesActual = "2025-07";
let datos = {};
let elementoEditando = null;
let tipoEditando = null;

// ==========================
// Inicialización de Datos de Ejemplo
// ==========================
function inicializarDatos() {
    datos[mesActual] = {
        ingresos: [
            { id: 1, nombre: "Salario", monto: 3500000, fecha: "2025-07-01" },
            { id: 2, nombre: "Freelance", monto: 800000, fecha: "2025-07-15" }
        ],
        gastosFijos: [
            { id: 1, nombre: "Arriendo", monto: 1200000, categoria: "Vivienda", fecha: "2025-07-01" },
            { id: 2, nombre: "Servicios", monto: 300000, categoria: "Servicios", fecha: "2025-07-01" }
        ],
        gastosVariables: [
            { 
                id: 1, 
                nombre: "Tarjeta de Crédito", 
                montoTotal: 2000000, 
                tasaInteres: 2.5, 
                numeroCuotas: 12, 
                cuotasPagadas: 4,
                cuotaMensual: 0,
                interesTotal: 0,
                saldoPendiente: 0,
                fecha: "2025-07-01"
            }
        ],
        gastosCompras: [
            { id: 1, nombre: "Supermercado", monto: 400000, categoria: "Alimentación", fecha: "2025-07-10" },
            { id: 2, nombre: "Gasolina", monto: 150000, categoria: "Transporte", fecha: "2025-07-12" }
        ]
    };
    datos[mesActual].gastosVariables.forEach(credito => {
        credito.cuotaMensual = calcularCuotaConInteres(credito.montoTotal, credito.tasaInteres, credito.numeroCuotas);
        credito.interesTotal = calcularInteresTotal(credito.montoTotal, credito.tasaInteres, credito.numeroCuotas);
        credito.saldoPendiente = calcularSaldoPendiente(credito.montoTotal, credito.numeroCuotas, credito.cuotasPagadas);
    });
}

// ==========================
// Utilidades de Cálculo
// ==========================
function formatMoney(amount) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    }).format(amount);
}

function calcularCuotaConInteres(montoTotal, tasaInteres, numeroCuotas) {
    montoTotal = parseFloat(montoTotal) || 0;
    tasaInteres = parseFloat(tasaInteres) || 0;
    numeroCuotas = parseInt(numeroCuotas) || 1;
    if (tasaInteres === 0) return montoTotal / numeroCuotas;
    const interesMensual = tasaInteres / 100;
    const factor = Math.pow(1 + interesMensual, numeroCuotas);
    const cuota = (montoTotal * interesMensual * factor) / (factor - 1);
    return isNaN(cuota) ? 0 : cuota;
}

function calcularInteresTotal(montoTotal, tasaInteres, numeroCuotas) {
    const cuotaMensual = calcularCuotaConInteres(montoTotal, tasaInteres, numeroCuotas);
    return (cuotaMensual * numeroCuotas) - montoTotal;
}

function calcularSaldoPendiente(montoTotal, numeroCuotas, cuotasPagadas) {
    const capitalPorCuota = montoTotal / numeroCuotas;
    const capitalPagado = capitalPorCuota * cuotasPagadas;
    return Math.max(0, montoTotal - capitalPagado);
}

// ==========================
// Funciones Generales (agregar, editar, mostrar, eliminar)
// ==========================
// Aquí se agregan las funciones ya existentes del archivo: agregarIngreso, agregarGastoFijo, agregarCredito, agregarCompra,
// mostrarIngresos, mostrarGastosFijos, mostrarCreditos, mostrarCompras, mostrarHistorial, editarCredito, guardarEdicion,
// recalcularCredito, eliminarCredito, eliminarItem, cerrarModal, actualizarResumen, actualizarTodo, limpiarTodo, exportarDatos,
// cambiarMes, showTab, probarCreditos, probarResumen, probarCalculos.

// ⚠️ NOTA: por motivos de longitud, esas funciones están incluidas en los archivos originales y se conservarán tal cual.
// Si deseas que las vuelva a integrar aquí también (todo el archivo completo en una sola pieza), dime y lo armo todo junto.

// ==========================
// Inicialización en DOM
// ==========================
document.addEventListener('DOMContentLoaded', function() {
    console.log('Organizador Financiero - Iniciado');
    inicializarDatos();
    actualizarTodo();

    const modal = document.getElementById('editModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) cerrarModal();
        });
    }
});
