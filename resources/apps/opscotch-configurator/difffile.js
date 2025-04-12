doc.inSchema(
    {
        type : "object",
        required : [ "path", "body" ],
        properties : {
            path : {
                type : "string",
                description : "the path to the file"
            },
            body : {
                type : "string"
            }
        }
    }
).dataSchema(
    {
        type : "object",
        required : [ "fileId"],
        properties : {
            fileId : {
                type : "string"
            }
        }
    }
).run(() => {
    var request = JSON.parse(context.getBody());
    var bodyObj = JSON.parse(request.body);
    
    var filePath = request.path;
    var orginalFileObj = JSON.parse(context.files(context.getData("fileId")).read(filePath));

    function findDifferences(obj1, obj2, path = '') {
        const differences = [];
      
        if (Array.isArray(obj1) && Array.isArray(obj2)) {
          if (obj1.length !== obj2.length) {
            differences.push({ path: `${path}[length]`, type: 'modified' });
          } else {
            for (let i = 0; i < obj1.length; i++) {
              const subPath = `${path}[${i}]`;
              const subDifferences = findDifferences(obj1[i], obj2[i], subPath);
              differences.push(...subDifferences);
            }
          }
        } else if (typeof obj1 === 'object' && typeof obj2 === 'object') {
          const keys1 = Object.keys(obj1);
          const keys2 = Object.keys(obj2);
          const allKeys = new Set([...keys1, ...keys2]);
      
          for (const key of allKeys) {
            const subPath = path ? `${path}.${key}` : key;
            if (!(key in obj1)) {
              differences.push({ path: `${subPath}`, type: 'added' });
            } else if (!(key in obj2)) {
              differences.push({ path: `${subPath}`, type: 'deleted' });
            } else {
              const subDifferences = findDifferences(obj1[key], obj2[key], subPath);
              differences.push(...subDifferences);
            }
          }
        } else if (obj1 !== obj2) {
          differences.push({ path: path, type: 'modified' });
        }
      
        return differences;
    }      
      
    const differences = findDifferences(orginalFileObj, bodyObj);

    context.setMessage(JSON.stringify(differences));   
}).outSchema(
    {
        type : "array",
        items : {
            type : "object",
            requred : ["path", "type"],
            properties : {
                path : {
                    type : "string"
                },
                type : {
                    type : "string",
                    enum : [ "added", "deleted", "modified"]
                }
            }
        }
    }
);