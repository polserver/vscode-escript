const doctrine = require('./doctrine');

const { inspect } = require('util');
inspect.defaultOptions.depth = Infinity;

const str = `/**
* The base UO Object class
*
* @typedef UObject
* @member:
* - name {String} name string (for items use .desc for single-click text, this does not include
    suffix or formatting)
* - color {Long} color value (0 to 0xFFF) 
* - dirty! {Long} This is set when anything on the object changes, and cleared on world save   
* - facing {Long} facing or the object (meaningful for mobiles and light-emitting items) range 0-127  
* - graphic {Long} art id number  
* - height! {Long} height of the graphic as defined in tiledata.mul    
* - multi! {Multi} MultiRef for the Multi the object is on 
* - objtype! {Long} object type as defined in itemdesc.cfg 
* - realm! {String} case-sensitive name of the realm   
* - serial! {Long} unique object identifier    
* - specific_name {Long} Set if a specific name is set, otherwise like itemdesc name false.   
* - weight! {Integer} weight of the graphic as defined in tiledata.mul 
* - x! {Integer} x coordinate  
* - y! {Integer} y coordinate  
* - z! {Integer} zz
*
* @method:
* - eraseprop {(propname: String): (Long | error)} Erases the property named 'propname'.
* - get_member {(membername: String): *} Gets the value of the built-in member 'membername'. var objname :=
*   obj.get_member("name") is the same as var objname := obj.name
* - getprop {(propname: String): *} Returns an unpacked script object (i.e. int,string,array,etc)
* - isa {(class: Long): Long} True if the derived class is the same as the passed class type (see uo.em for all
*   constants)
* - propnames {(): String[]} Returns an array of property name strings.
* - set_member {(membername: String, value: *): *} Sets the built-in member 'membername' to 'value'.
*   obj.set_member("name","Eric") is the same as obj.name := "Eric"
* - setprop {(proppname: String, propval: *): (Long | error)} Sets a packable object to a property.
*/
`;

console.log(doctrine.parse(str, { unwrap: true, lineNumbers: true, range: true }));